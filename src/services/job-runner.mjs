import crypto from "node:crypto";

import { getRunner } from "../runners/index.mjs";
import { getProviderMeta, isFreeModelAllowed } from "../providers/catalog.mjs";
import { estimateTokens } from "./token-budget.mjs";
import { buildBudgetAwarePrompt } from "./prompt-trim.mjs";
import { buildThreadHistoryContext } from "./thread-context.mjs";
import {
  buildCodexNativeContinuityError,
  isCodexNativeThreadMode,
} from "./codex-native-continuity.mjs";
import { appendJobOutput, clearJobOutput } from "./job-output.mjs";
import { validateCodexSession } from "./codex-sessions.mjs";
import {
  buildProviderNativeContinuityError,
  countPriorProviderContinuityTurns,
  getLatestPriorProvider,
  isFinalizedThreadJob,
  normalizeProvider,
  providerLabel,
  supportsNativeProviderSessions,
} from "./provider-thread-continuity.mjs";
import { buildProviderSwitchContext } from "./provider-switch-context.mjs";
import {
  evaluateRuntimeApprovalRequest,
} from "./runtime-policy.mjs";

function truncate(input, max) {
  const value = String(input ?? "").trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
}

function buildRunningUpdate(job, startedAtMs) {
  return [
    `Job ${job.id} is still running.`,
    `Project: ${job.projectName}`,
    `Elapsed: ${formatDuration(Date.now() - startedAtMs)}`,
  ].join("\n");
}

function isFreeTierExhaustedError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("payment required") ||
    message.includes("insufficient credits") ||
    message.includes("billing") ||
    message.includes("free tier")
  );
}

function publishThreadContinuityError({ eventBus, job, message, payload = {} }) {
  eventBus.publish({
    jobId: job.id,
    chatId: job.chatId,
    eventType: "thread_continuity_error",
    message,
    payload: {
      threadId: job.threadId || "",
      ...payload,
    },
  });
}

export class JobRunner {
  constructor({ config, state, eventBus, repository, threadSync = null }) {
    this.config = config;
    this.state = state;
    this.eventBus = eventBus;
    this.repository = repository;
    this.threadSync = threadSync;
    this.runningJobIds = new Set();
    this.runningThreadKeys = new Set();
    this.threadQueues = new Map();
    this.queue = Promise.resolve();
    this.enqueuedJobIds = new Set();
    this.abortControllers = new Map();
  }

  getRunningJobId() {
    return this.runningJobIds.values().next().value || null;
  }

  getRunningJobIds() {
    return Array.from(this.runningJobIds);
  }

  countRunningJobs() {
    return this.runningJobIds.size;
  }

  getLaneKey(job) {
    return String(job?.threadId || job?.id || "").trim();
  }

  isThreadRunning(threadId = "") {
    const laneKey = this.getLaneKey({ threadId });
    return laneKey ? this.runningThreadKeys.has(laneKey) : false;
  }

  refreshQueueSnapshot() {
    this.queue = Promise.all(Array.from(this.threadQueues.values())).then(() => {});
  }

  stop({ jobId }) {
    const job = this.state.getJobById(jobId);
    if (!job) {
      return { error: `Job ${jobId} was not found.` };
    }

    const status = String(job.status || "").toLowerCase();
    if (["completed", "failed", "denied", "cancelled"].includes(status)) {
      return { error: `Job ${jobId} is already ${status}.` };
    }

    const cancelledAt = new Date().toISOString();
    if (status === "queued" || status === "pending_approval") {
      this.state.patchJob(job.id, {
        status: "cancelled",
        cancelledAt,
        completedAt: cancelledAt,
        error: "Run cancelled by user.",
      });
      this.eventBus.publish({
        jobId: job.id,
        chatId: job.chatId,
        eventType: "job_cancelled",
        message: "Job cancelled by user.",
        payload: { cancelledAt },
      });
      this.state.markPendingConsumed(job.id);
      this.enqueuedJobIds.delete(job.id);
      return { ok: true };
    }

    const controller = this.abortControllers.get(job.id);
    if (!controller) {
      return { error: `Job ${jobId} is not currently stoppable.` };
    }
    controller.abort();
    return { ok: true };
  }

  async resolveRuntimeApprovalRequest(job, request) {
    const provider = normalizeProvider(job?.provider) || this.state.getProvider();
    if (this.config.runtimePolicy?.autoApproveAll !== false) {
      const now = new Date().toISOString();
      const approvalKey = String(request?.approvalId || crypto.randomUUID().slice(0, 8));
      const approvalId = `${job.id}:${approvalKey}`;
      const kind = String(request?.kind || "unknown");
      const summary = kind === "file_change" ? "Apply file changes" : "Run command";

      const saved = this.state.createRuntimeApproval({
        id: approvalId,
        provider,
        chatId: job.chatId,
        jobId: job.id,
        threadId: job.threadId || "",
        method: request?.method || "",
        kind,
        riskLevel: "low",
        summary,
        reason: request?.reason || "",
        command: request?.command || "",
        cwd: request?.cwd || "",
        payload: request || {},
        createdAt: now,
        status: "auto_approved",
        resolvedAt: now,
        resolvedByChatId: "policy",
      });

      this.eventBus.publish({
        jobId: job.id,
        chatId: job.chatId,
        eventType: "runtime_approval_auto_approved",
        message: "Auto-approved runtime action (auto_approve_all).",
        payload: {
          approvalId: saved?.id || approvalId,
          riskLevel: "low",
          summary,
        },
      });
      return "approve";
    }

    const policy = evaluateRuntimeApprovalRequest(request);
    const effectivePolicy = { ...policy };
    if (
      request?.kind === "file_change"
      && !this.config.runtimePolicy?.fileChangeRequiresApproval
    ) {
      effectivePolicy.decision = "approve";
      effectivePolicy.requiresApproval = false;
      effectivePolicy.riskLevel = "low";
      effectivePolicy.policyRule = "file_change_auto_approved";
      if (!effectivePolicy.summary) {
        effectivePolicy.summary = "Apply file changes";
      }
    }
    const now = new Date().toISOString();
    const approvalKey = String(request.approvalId || crypto.randomUUID().slice(0, 8));
    const approvalId = `${job.id}:${approvalKey}`;

    const baseRecord = {
      id: approvalId,
      provider,
      chatId: job.chatId,
      jobId: job.id,
      threadId: job.threadId || "",
      method: request.method || "",
      kind: request.kind || "unknown",
      riskLevel: effectivePolicy.riskLevel,
      summary: effectivePolicy.summary,
      reason: request.reason || "",
      command: request.command || "",
      cwd: request.cwd || "",
      payload: request,
      createdAt: now,
    };

    if (!effectivePolicy.requiresApproval) {
      const saved = this.state.createRuntimeApproval({
        ...baseRecord,
        status: "auto_approved",
        resolvedAt: now,
        resolvedByChatId: "policy",
      });
      this.eventBus.publish({
        jobId: job.id,
        chatId: job.chatId,
        eventType: "runtime_approval_auto_approved",
        message: `Auto-approved runtime action (${effectivePolicy.policyRule}).`,
        payload: {
          approvalId: saved?.id || approvalId,
          riskLevel: effectivePolicy.riskLevel,
          summary: effectivePolicy.summary,
        },
      });
      return "approve";
    }

    const pending = this.state.createRuntimeApproval({
      ...baseRecord,
      status: "pending",
    });

    if (!pending) {
      return "deny";
    }

    this.eventBus.publish({
      jobId: job.id,
      chatId: job.chatId,
      eventType: "runtime_approval_requested",
      message: effectivePolicy.summary,
      payload: {
        approvalId: pending.id,
        riskLevel: effectivePolicy.riskLevel,
        kind: pending.kind,
        command: pending.command,
        cwd: pending.cwd,
      },
    });

    const decision = await this.state.waitForRuntimeApprovalDecision(pending.id);
    const resolved = this.state.resolveRuntimeApproval({
      id: pending.id,
      status: decision === "approve" ? "approved" : "denied",
      resolvedByChatId: this.state.getOwnerId(),
    });

    this.eventBus.publish({
      jobId: job.id,
      chatId: job.chatId,
      eventType: "runtime_approval_resolved",
      message: decision === "approve" ? "Runtime approval granted." : "Runtime approval denied.",
      payload: {
        approvalId: pending.id,
        decision,
        riskLevel: resolved?.riskLevel || effectivePolicy.riskLevel,
      },
    });

    return decision === "approve" ? "approve" : "deny";
  }

  enqueue(job) {
    if (!job?.id) {
      return;
    }
    if (this.enqueuedJobIds.has(job.id)) {
      return;
    }
    this.enqueuedJobIds.add(job.id);

    const laneKey = this.getLaneKey(job);
    const previousLane = this.threadQueues.get(laneKey) || Promise.resolve();
    const lanePromise = previousLane
      .catch(() => {})
      .then(async () => {
        const leaseId = crypto.randomUUID();
        const startedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();

        const claimedJob = this.state.claimJobForExecution({
          jobId: job.id,
          leaseId,
          startedAt: startedAtIso,
        });
        if (!claimedJob) {
          this.eventBus.publish({
            jobId: job.id,
            chatId: job.chatId,
            eventType: "job_skipped_duplicate",
            message: "Skipped duplicate execution attempt.",
            payload: {
              leaseId,
            },
          });
          this.enqueuedJobIds.delete(job.id);
          return;
        }

        const activeJob = claimedJob;
        this.runningJobIds.add(activeJob.id);
        this.runningThreadKeys.add(laneKey);

        // Auto-title thread from first user message
        if (activeJob.threadId && this.repository) {
          try {
            const thread = this.repository.getThread(activeJob.threadId);
            if (thread && String(thread.title || "").trim().toLowerCase() === "new thread") {
              const title = truncate(activeJob.request, 60);
              this.repository.updateThread(activeJob.threadId, { title });
            }
          } catch {
            // non-critical
          }
        }
        this.eventBus.publish({
          jobId: activeJob.id,
          chatId: activeJob.chatId,
          eventType: "job_running",
          message: "Job execution started.",
          payload: {
            startedAt: startedAtIso,
            projectName: activeJob.projectName,
            workdir: activeJob.workdir,
            leaseId,
          },
        });

        let progressTimer = null;
        if (this.config.app?.progressUpdates) {
          progressTimer = setInterval(() => {
            const message = buildRunningUpdate(activeJob, startedAtMs);
            this.eventBus.publish({
              jobId: activeJob.id,
              chatId: activeJob.chatId,
              eventType: "job_progress",
              message,
              payload: {
                elapsedMs: Date.now() - startedAtMs,
              },
            });
          }, this.config.app.progressUpdateSeconds * 1000);

          if (typeof progressTimer.unref === "function") {
            progressTimer.unref();
          }
        }

        let threadIdForBudget = activeJob.threadId || "";
        let inputTokenEstimate = 0;
        let outputTokenEstimate = 0;
        let providerForRun = normalizeProvider(activeJob.provider) || this.state.getProvider();
        const abortController = new AbortController();
        this.abortControllers.set(activeJob.id, abortController);

        try {
          const provider = normalizeProvider(activeJob.provider) || this.state.getProvider();
          providerForRun = provider;
          const providerConfig = this.config.runner;
          const runner = getRunner(provider);
          const providerMeta = getProviderMeta(provider);
          const model = (normalizeProvider(this.state.getProvider()) === provider ? this.state.getModel() : "")
            || (provider === providerConfig.provider ? providerConfig.model : "")
            || providerMeta?.defaultModel
            || "";
          const reasoningEffort = this.state.getReasoningEffort();
          const planMode = this.state.getPlanMode();
          const codexParityMode = provider === "codex" && this.config.codex?.parityMode !== false;
          const nativeCodexThreadMode = isCodexNativeThreadMode({
            provider,
            parityMode: codexParityMode,
          });
          const providerNativeThreadMode = provider === "codex"
            ? nativeCodexThreadMode
            : supportsNativeProviderSessions(provider);
          const talkebyRuntimePolicyEnabled = provider === "codex" && this.config.runtimePolicy?.enabled !== false;
          const codexSessionResumeEnabled = this.config.codex?.disableSessionResume !== true;
          const shouldUseTalkebyRuntimePolicy = talkebyRuntimePolicyEnabled && !nativeCodexThreadMode;

          let sessionId = null;
          let taskText = activeJob.request;
          let threadAutoTrimContext = this.config.threads?.autoTrimContextDefault !== false;
          let threadTokenBudget = toNonNegativeInt(this.config.threads?.defaultTokenBudget, 0);
          let threadRemainingBudget = 0;
          let bootstrapPrompt = "";
          let resumeContext = "";
          let threadContext = "";
          let managedContextDisabled = false;
          let providerContinuityTurns = 0;
          let previousThreadProvider = "";
          let providerSession = null;

          if (nativeCodexThreadMode && talkebyRuntimePolicyEnabled) {
            const continuityMessage = buildCodexNativeContinuityError({
              reason: "runtime_policy_interception",
              threadId: activeJob.threadId,
            });
            publishThreadContinuityError({
              eventBus: this.eventBus,
              job: activeJob,
              message: continuityMessage,
              payload: {
                reason: "runtime_policy_interception",
              },
            });
            throw new Error(continuityMessage);
          }

          if (activeJob.threadId && this.repository) {
            try {
              const thread = this.repository.getThread(activeJob.threadId);
              providerSession = providerNativeThreadMode
                ? this.repository.getThreadProviderSession(activeJob.threadId, provider)
                : null;
              sessionId = providerNativeThreadMode
                ? (providerSession?.sessionId || null)
                : (thread?.cliSessionId || null);
              threadAutoTrimContext = thread?.autoTrimContext !== 0;
              const tokenBudget = toNonNegativeInt(
                thread?.tokenBudget,
                toNonNegativeInt(this.config.threads?.defaultTokenBudget, 0),
              );
              threadTokenBudget = tokenBudget;
              const tokenUsed = toNonNegativeInt(thread?.tokenUsed, 0);
              threadRemainingBudget = Math.max(0, tokenBudget - tokenUsed);
              const threadJobs = this.repository.listJobsByThread(activeJob.threadId, 5000);
              providerContinuityTurns = providerNativeThreadMode
                ? countPriorProviderContinuityTurns(threadJobs, {
                    currentJobId: activeJob.id,
                    provider,
                    legacyFallbackProvider: provider === "codex" ? provider : "",
                  })
                : 0;
              previousThreadProvider = providerNativeThreadMode
                ? getLatestPriorProvider(threadJobs, {
                    currentJobId: activeJob.id,
                  })
                : "";
              const hasPriorVisibleThreadHistory = threadJobs.some((job) => (
                String(job?.id || "") !== String(activeJob.id)
                && isFinalizedThreadJob(job)
              ));
              const isCrossProviderSwitch = previousThreadProvider
                && previousThreadProvider !== provider;
              const isUnknownProviderBootstrap = !previousThreadProvider
                && !sessionId
                && hasPriorVisibleThreadHistory
                && providerContinuityTurns === 0;
              const isProviderSwitch = providerNativeThreadMode && !nativeCodexThreadMode && (
                isCrossProviderSwitch
                || isUnknownProviderBootstrap
              );
              bootstrapPrompt = isProviderSwitch
                ? buildProviderSwitchContext({
                    repository: this.repository,
                    threadId: activeJob.threadId,
                    currentJobId: activeJob.id,
                    syncedJobId: providerSession?.syncedJobId || "",
                    fromProvider: previousThreadProvider || "talkeby",
                    toProvider: provider,
                  })
                : "";

              if (
                threadAutoTrimContext
                && tokenBudget > 0
                && threadRemainingBudget <= 0
                && sessionId
                && !providerNativeThreadMode
                && !codexParityMode
              ) {
                sessionId = null;
                this.eventBus.publish({
                  jobId: activeJob.id,
                  chatId: activeJob.chatId,
                  eventType: "thread_context_trimmed",
                  message: "Thread token budget exhausted; starting a fresh session context.",
                  payload: {
                    threadId: activeJob.threadId,
                    tokenBudget,
                    tokenUsed,
                  },
                });
              }
              if (bootstrapPrompt) {
                const handoffSource = previousThreadProvider || "talkeby";
                const handoffSourceLabel = providerLabel(handoffSource);
                const handoffTargetLabel = providerLabel(provider);
                this.eventBus.publish({
                  jobId: activeJob.id,
                  chatId: activeJob.chatId,
                  eventType: "provider_switch_context_applied",
                  message: `Applied compact ${handoffSourceLabel} -> ${handoffTargetLabel} thread handoff.`,
                  payload: {
                    threadId: activeJob.threadId,
                    fromProvider: handoffSource,
                    toProvider: provider,
                    syncedJobId: providerSession?.syncedJobId || "",
                  },
                });
              }
            } catch {
              // non-critical
            }
          }

          if (nativeCodexThreadMode && providerContinuityTurns > 0 && !bootstrapPrompt && !codexSessionResumeEnabled) {
            const continuityMessage = buildCodexNativeContinuityError({
              reason: "session_resume_disabled",
              threadId: activeJob.threadId,
            });
            publishThreadContinuityError({
              eventBus: this.eventBus,
              job: activeJob,
              message: continuityMessage,
              payload: {
                reason: "session_resume_disabled",
              },
            });
            throw new Error(continuityMessage);
          }

          if (nativeCodexThreadMode && sessionId) {
            const validation = await validateCodexSession({
              sessionId,
              workdir: activeJob.workdir,
              minTaskMessages: bootstrapPrompt ? 0 : providerContinuityTurns,
            });
            if (!validation.ok) {
              if (bootstrapPrompt) {
                sessionId = null;
              } else {
                const continuityMessage = buildCodexNativeContinuityError({
                  reason: validation.reason,
                  threadId: activeJob.threadId,
                });
                publishThreadContinuityError({
                  eventBus: this.eventBus,
                  job: activeJob,
                  message: continuityMessage,
                  payload: {
                    reason: validation.reason,
                    priorContinuityTurns: providerContinuityTurns,
                    provider,
                    sessionId: sessionId || "",
                  },
                });
                throw new Error(continuityMessage);
              }
            }
            if (validation.ok) {
              sessionId = validation.session?.sessionId || sessionId;
            }
          } else if (nativeCodexThreadMode && providerContinuityTurns > 0 && !bootstrapPrompt) {
            const continuityMessage = buildCodexNativeContinuityError({
              reason: "missing_session_id",
              threadId: activeJob.threadId,
            });
            publishThreadContinuityError({
              eventBus: this.eventBus,
              job: activeJob,
              message: continuityMessage,
              payload: {
                reason: "missing_session_id",
                priorContinuityTurns: providerContinuityTurns,
                provider,
                sessionId: "",
              },
            });
            throw new Error(continuityMessage);
          }

          if (
            providerNativeThreadMode
            && provider !== "codex"
            && providerContinuityTurns > 0
            && !bootstrapPrompt
            && !sessionId
          ) {
            const continuityMessage = buildProviderNativeContinuityError({
              provider,
              threadId: activeJob.threadId,
            });
            publishThreadContinuityError({
              eventBus: this.eventBus,
              job: activeJob,
              message: continuityMessage,
              payload: {
                reason: "missing_session_id",
                priorContinuityTurns: providerContinuityTurns,
                provider,
              },
            });
            throw new Error(continuityMessage);
          }

          if (provider === "codex" && this.config.codex?.disableSessionResume) {
            sessionId = null;
          }

          managedContextDisabled = Boolean(
            providerNativeThreadMode || (provider === "codex" && sessionId),
          );
          if (!managedContextDisabled && activeJob.threadId && this.repository) {
            threadContext = buildThreadHistoryContext({
              repository: this.repository,
              threadId: activeJob.threadId,
              currentJobId: activeJob.id,
            });
          }
          if (!managedContextDisabled && activeJob.resumedFromJobId && this.repository) {
            const original = this.repository.getJobById(activeJob.resumedFromJobId);
            if (original?.error) {
              resumeContext = String(original.error);
            }
          }

          const effectiveResumeContext = managedContextDisabled ? "" : resumeContext;
          const effectiveThreadContext = managedContextDisabled ? "" : threadContext;
          const budgetEnabled = threadTokenBudget > 0 && !managedContextDisabled;
          const prepared = buildBudgetAwarePrompt({
            userTask: activeJob.request,
            bootstrapPrompt,
            resumeContext: effectiveResumeContext,
            threadContext: effectiveThreadContext,
            remainingBudget: threadRemainingBudget,
            budgetEnabled,
            autoTrimContext: threadAutoTrimContext,
          });
          taskText = prepared.prompt;
          inputTokenEstimate = prepared.estimatedTokens;
          if (prepared.trimmed) {
            this.eventBus.publish({
              jobId: activeJob.id,
              chatId: activeJob.chatId,
              eventType: "thread_context_trimmed",
              message: "Prompt context trimmed to fit thread token budget.",
              payload: {
                threadId: activeJob.threadId || null,
                removed: prepared.removed,
                estimatedTokens: prepared.estimatedTokens,
                cannotFit: Boolean(prepared.cannotFit),
                remainingBudget: threadRemainingBudget,
              },
            });
          }

          if (!isFreeModelAllowed({
            providerName: provider,
            modelName: model,
            freeModelsOnly: Boolean(providerConfig.freeModelsOnly),
          })) {
            throw new Error(
              `Model "${model}" is not allowed while FREE_MODELS_ONLY=true for provider "${provider}".`,
            );
          }

          if (this.config.debug?.logPromptPayload) {
            console.log(
              `[job:${activeJob.id}] outbound_prompt`,
              JSON.stringify(
                {
                  provider,
                  model: model || "",
                  projectName: activeJob.projectName,
                  workdir: activeJob.workdir,
                  threadId: activeJob.threadId || "",
                  sessionId: sessionId || "",
                  codexParityMode,
                  requestChars: String(activeJob.request || "").length,
                  promptChars: String(taskText || "").length,
                  prompt: String(taskText || ""),
                },
                null,
                2,
              ),
            );
          }

          const result = await runner({
            task: taskText,
            workdir: activeJob.workdir,
            model,
            reasoningEffort,
            planMode,
            timeoutMs: providerConfig.timeoutMs,
            binary: providerConfig.binaries[provider] || provider,
            sessionId,
            nativeCodexThreadMode,
            persistExtendedHistory: Boolean(this.config.codex?.persistExtendedHistory),
            sandboxMode: this.config.codex?.sandboxMode || "workspace-write",
            signal: abortController.signal,
            onLine: (line) => {
              appendJobOutput(activeJob.id, line);
              outputTokenEstimate += estimateTokens(line);
            },
            onRuntimeApproval: shouldUseTalkebyRuntimePolicy
              ? (request) => this.resolveRuntimeApprovalRequest(activeJob, request)
              : undefined,
            onRuntimeEvent: shouldUseTalkebyRuntimePolicy
              ? (event) => {
                  if (!event?.type) {
                    return;
                  }
                  if (event.type === "runtime_approval_requested") {
                    return;
                  }
                  if (event.type === "agent_message" || event.type === "fatal_error" || event.type === "turn_failed") {
                    this.eventBus.publish({
                      jobId: activeJob.id,
                      chatId: activeJob.chatId,
                      eventType: "agent_log",
                      message: String(event.message || event.text || event.type),
                      payload: event,
                    });
                  }
                }
              : undefined,
          });

          if (activeJob.threadId && this.repository && !shouldUseTalkebyRuntimePolicy) {
            try {
              const effectiveSessionId = String(result.newSessionId || sessionId || "").trim();
              if (providerNativeThreadMode && effectiveSessionId) {
                this.repository.upsertThreadProviderSession({
                  threadId: activeJob.threadId,
                  provider,
                  sessionId: effectiveSessionId,
                  syncedJobId: activeJob.id,
                });
                if (provider === "codex") {
                  await this.threadSync?.syncTalkebyThread(activeJob.threadId);
                }
              } else if (provider === "codex" && result.newSessionId) {
                this.repository.updateThread(activeJob.threadId, {
                  cliSessionId: result.newSessionId,
                });
                await this.threadSync?.syncTalkebyThread(activeJob.threadId);
              }
            } catch {
              // non-critical
            }
          }

          const completedAt = new Date().toISOString();
          const exactTotal = Number.parseInt(String(result?.usage?.totalTokens || 0), 10);
          const exactInput = Number.parseInt(String(result?.usage?.inputTokens || 0), 10);
          const exactOutput = Number.parseInt(String(result?.usage?.outputTokens || 0), 10);
          const hasExactUsage = Number.isFinite(exactTotal) && exactTotal > 0;
          const usageSource = hasExactUsage
            ? "exact"
            : (provider === "codex" ? "provider_unavailable" : "estimate");
          const totalTokens = usageSource === "exact"
            ? Math.max(0, exactTotal)
            : (usageSource === "estimate"
              ? inputTokenEstimate + outputTokenEstimate + estimateTokens(result.message)
              : 0);
          const inputTokens = usageSource === "exact"
            ? Math.max(0, exactInput)
            : (usageSource === "estimate" ? inputTokenEstimate : null);
          const outputTokens = usageSource === "exact"
            ? Math.max(0, exactOutput)
            : (usageSource === "estimate" ? outputTokenEstimate + estimateTokens(result.message) : null);
          if (this.config.debug?.logTokenUsage) {
            console.log(
              `[job:${activeJob.id}] token_usage`,
              JSON.stringify(
                {
                  provider,
                  model: model || "",
                  source: usageSource,
                  inputTokens,
                  outputTokens,
                  totalTokens,
                  usageRaw: result?.usage || null,
                },
                null,
                2,
              ),
            );
          }
          if (usageSource === "provider_unavailable") {
            this.eventBus.publish({
              jobId: activeJob.id,
              chatId: activeJob.chatId,
              eventType: "thread_token_usage",
              message: "Provider did not return per-job token usage for this run.",
              payload: {
                threadId: threadIdForBudget,
                consumed: null,
                source: usageSource,
              },
            });
          }
          if (threadIdForBudget && totalTokens > 0 && this.repository) {
            const threadAfterUsage = this.repository.addThreadTokenUsage({
              threadId: threadIdForBudget,
              total: totalTokens,
              source: usageSource,
            });
            this.eventBus.publish({
              jobId: activeJob.id,
              chatId: activeJob.chatId,
              eventType: "thread_token_usage",
              message: `${usageSource === "exact" ? "Exact" : "Estimated"} token usage +${totalTokens}.`,
              payload: {
                threadId: threadIdForBudget,
                consumed: totalTokens,
                source: usageSource,
                tokenUsed: threadAfterUsage?.tokenUsed ?? null,
                tokenBudget: threadAfterUsage?.tokenBudget ?? null,
                tokenUsedExact: threadAfterUsage?.tokenUsedExact ?? null,
                tokenUsedEstimated: threadAfterUsage?.tokenUsedEstimated ?? null,
              },
            });
          }
          this.state.patchJob(activeJob.id, {
            status: "completed",
            completedAt,
            summary: result.message,
            error: "",
            tokenSource: usageSource,
            tokenInput: inputTokens,
            tokenOutput: outputTokens,
            tokenTotal: totalTokens,
            providerCostUsd: result?.usage?.costUsd ?? null,
          });
          this.eventBus.publish({
            jobId: activeJob.id,
            chatId: activeJob.chatId,
            eventType: "job_completed",
            message: "Job completed successfully.",
            payload: {
              completedAt,
            },
          });
        } catch (error) {
          const wasCancelled = abortController.signal.aborted
            || String(error?.message || "").toLowerCase().includes("cancelled");
          const failedAt = new Date().toISOString();
          const quotaHint = !wasCancelled && isFreeTierExhaustedError(error)
            ? " Free tier appears exhausted; choose another free model/provider or disable FREE_MODELS_ONLY."
            : "";
          const failureMessage = truncate(
            wasCancelled ? "Run cancelled by user." : `${error.message || "Job failed."}${quotaHint}`,
            3000,
          );
          const provider = providerForRun || this.state.getProvider();
          const useEstimatedFailureUsage = true;
          const estimatedFailureOutput = outputTokenEstimate + estimateTokens(failureMessage);
          const totalEstimate = inputTokenEstimate + estimatedFailureOutput;
          const failureUsageSource = useEstimatedFailureUsage ? "estimate" : "provider_unavailable";
          const failureInputTokens = useEstimatedFailureUsage ? inputTokenEstimate : null;
          const failureOutputTokens = useEstimatedFailureUsage ? estimatedFailureOutput : null;
          const failureTotalTokens = useEstimatedFailureUsage ? totalEstimate : null;
          if (this.config.debug?.logTokenUsage) {
            console.log(
              `[job:${activeJob.id}] token_usage`,
              JSON.stringify(
                {
                  provider,
                  model: this.state.getModel() || this.config.runner?.model || "",
                  source: failureUsageSource,
                  inputTokens: failureInputTokens,
                  outputTokens: failureOutputTokens,
                  totalTokens: failureTotalTokens,
                  usageRaw: null,
                },
                null,
                2,
              ),
            );
          }
          if (threadIdForBudget && useEstimatedFailureUsage && totalEstimate > 0 && this.repository) {
            const threadAfterUsage = this.repository.addThreadTokenUsage({
              threadId: threadIdForBudget,
              total: totalEstimate,
              source: "estimate",
            });
            this.eventBus.publish({
              jobId: activeJob.id,
              chatId: activeJob.chatId,
              eventType: "thread_token_usage",
              message: `Estimated token usage +${totalEstimate}.`,
              payload: {
                threadId: threadIdForBudget,
                consumed: totalEstimate,
                source: "estimate",
                tokenUsed: threadAfterUsage?.tokenUsed ?? null,
                tokenBudget: threadAfterUsage?.tokenBudget ?? null,
                tokenUsedExact: threadAfterUsage?.tokenUsedExact ?? null,
                tokenUsedEstimated: threadAfterUsage?.tokenUsedEstimated ?? null,
              },
            });
          }
          this.state.patchJob(activeJob.id, {
            status: wasCancelled ? "cancelled" : "failed",
            completedAt: failedAt,
            cancelledAt: wasCancelled ? failedAt : null,
            error: failureMessage,
            tokenSource: failureUsageSource,
            tokenInput: failureInputTokens,
            tokenOutput: failureOutputTokens,
            tokenTotal: failureTotalTokens,
            providerCostUsd: null,
          });
          this.eventBus.publish({
            jobId: activeJob.id,
            chatId: activeJob.chatId,
            eventType: wasCancelled ? "job_cancelled" : "job_failed",
            message: failureMessage,
            payload: {
              [wasCancelled ? "cancelledAt" : "failedAt"]: failedAt,
            },
          });
        } finally {
          this.abortControllers.delete(activeJob.id);
          if (progressTimer) {
            clearInterval(progressTimer);
          }
          this.state.markPendingConsumed(activeJob.id);
          this.runningJobIds.delete(activeJob.id);
          this.runningThreadKeys.delete(laneKey);
          // Free streaming output buffer
          clearJobOutput(activeJob.id);
          this.enqueuedJobIds.delete(activeJob.id);
        }
      })
      .catch((error) => {
        console.error("Unhandled queue error", error);
        this.enqueuedJobIds.delete(job.id);
        this.runningJobIds.delete(job.id);
        this.runningThreadKeys.delete(laneKey);
      });

    this.threadQueues.set(laneKey, lanePromise);
    this.refreshQueueSnapshot();
    lanePromise.finally(() => {
      if (this.threadQueues.get(laneKey) === lanePromise) {
        this.threadQueues.delete(laneKey);
      }
      this.refreshQueueSnapshot();
    });
  }
}

