import crypto from "node:crypto";

import { getRunner } from "../runners/index.mjs";
import { isFreeModelAllowed } from "../providers/catalog.mjs";
import { estimateTokens } from "./token-budget.mjs";
import { buildBudgetAwarePrompt } from "./prompt-trim.mjs";
import { buildThreadHistoryContext } from "./thread-context.mjs";
import {
  evaluateRuntimeApprovalRequest,
} from "./runtime-policy.mjs";
import { appendJobOutput, clearJobOutput } from "./job-output.mjs";

function truncate(input, max) {
  const value = String(input ?? "").trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
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

function buildRuntimeApprovalChatNotice(record) {
  const kind = String(record.kind || "runtime action");
  const risk = String(record.riskLevel || "medium");
  return [
    `Approval needed for job ${record.jobId}.`,
    `${kind} · risk: ${risk}`,
    "Open the web app Runtime Approvals to approve or deny.",
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

export class JobRunner {
  constructor({ config, state, eventBus, sendChatText, repository }) {
    this.config = config;
    this.state = state;
    this.eventBus = eventBus;
    this.sendChatText = sendChatText;
    this.repository = repository;

    this.runningJobId = "";
    this.queue = Promise.resolve();
    this.enqueuedJobIds = new Set();
    this.abortControllers = new Map();
  }

  getRunningJobId() {
    return this.runningJobId || null;
  }

  stop({ chatId, jobId }) {
    const job = this.state.getJobById(jobId);
    if (!job || String(job.chatId) !== String(chatId)) {
      return { error: `Job ${jobId} was not found in this chat.` };
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
      this.state.markPendingConsumed(job.chatId, job.id);
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
    if (this.config.runtimePolicy?.autoApproveAll !== false) {
      const now = new Date().toISOString();
      const approvalKey = String(request?.approvalId || crypto.randomUUID().slice(0, 8));
      const approvalId = `${job.id}:${approvalKey}`;
      const kind = String(request?.kind || "unknown");
      const summary = kind === "file_change" ? "Apply file changes" : "Run command";

      const saved = this.state.createRuntimeApproval({
        id: approvalId,
        provider: this.state.getProvider(),
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
      provider: this.state.getProvider(),
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

    if (this.config.runtimePolicy?.telegramApprovalNotifications) {
      try {
        await this.sendChatText({
          chatId: job.chatId,
          text: buildRuntimeApprovalChatNotice(pending),
        });
      } catch {
        // Non-critical.
      }
    }

    const decision = await this.state.waitForRuntimeApprovalDecision(pending.id);
    const resolved = this.state.resolveRuntimeApproval({
      id: pending.id,
      status: decision === "approve" ? "approved" : "denied",
      resolvedByChatId: job.chatId,
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

    this.queue = this.queue
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
        this.runningJobId = activeJob.id;

        // Auto-title thread from first user message
        if (activeJob.threadId && this.repository) {
          try {
            const thread = this.repository.getThread(activeJob.threadId);
            if (thread && thread.title === "New Thread") {
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

        try {
          await this.sendChatText({
            chatId: activeJob.chatId,
            text: [
              `Job ${activeJob.id} started.`,
              `Project: ${activeJob.projectName}`,
              `Path: ${activeJob.workdir}`,
            ].join("\n"),
          });
        } catch (error) {
          console.error(`[job:${activeJob.id}] failed to send running notification`, error);
        }

        let progressTimer = null;
        if (this.config.telegram.progressUpdates) {
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
            this.sendChatText({
              chatId: activeJob.chatId,
              text: message,
            }).catch((error) => {
              console.error(`[job:${activeJob.id}] failed to send progress update`, error);
            });
          }, this.config.telegram.progressUpdateSeconds * 1000);

          if (typeof progressTimer.unref === "function") {
            progressTimer.unref();
          }
        }

        let threadIdForBudget = activeJob.threadId || "";
        let inputTokenEstimate = 0;
        let outputTokenEstimate = 0;
        const abortController = new AbortController();
        this.abortControllers.set(activeJob.id, abortController);

        try {
          const provider = this.state.getProvider();
          const providerConfig = this.config.runner;
          const runner = getRunner(provider);
          const model = this.state.getModel() || providerConfig.model;
          const reasoningEffort = this.state.getReasoningEffort();
          const planMode = this.state.getPlanMode();

          // Look up thread's CLI session ID for continuity (all providers)
          let sessionId = null;
          let taskText = activeJob.request;
          let threadAutoTrimContext = this.config.threads?.autoTrimContextDefault !== false;
          let threadRemainingBudget = 0;
          let bootstrapPrompt = "";
          let bootstrapShouldApply = false;
          let resumeContext = "";
          let threadContext = "";

          if (activeJob.threadId && this.repository) {
            try {
              const thread = this.repository.getThread(activeJob.threadId);
              sessionId = thread?.cliSessionId || null;
              threadAutoTrimContext = thread?.autoTrimContext !== 0;
              const tokenBudget = toNonNegativeInt(
                thread?.tokenBudget,
                toNonNegativeInt(this.config.threads?.defaultTokenBudget, 0),
              );
              const tokenUsed = toNonNegativeInt(thread?.tokenUsed, 0);
              threadRemainingBudget = Math.max(0, tokenBudget - tokenUsed);
              if (threadAutoTrimContext && tokenBudget > 0 && threadRemainingBudget <= 0 && sessionId) {
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
              if (thread?.bootstrapPrompt && !thread?.bootstrapAppliedAt) {
                bootstrapPrompt = String(thread.bootstrapPrompt);
                bootstrapShouldApply = true;
              }
              threadContext = buildThreadHistoryContext({
                repository: this.repository,
                threadId: activeJob.threadId,
                currentJobId: activeJob.id,
              });
            } catch {
              // non-critical
            }
          }

          if (activeJob.resumedFromJobId && this.repository) {
            const original = this.repository.getJobById(activeJob.resumedFromJobId);
            if (original?.error) {
              resumeContext = String(original.error);
            }
          }

          const prepared = buildBudgetAwarePrompt({
            userTask: activeJob.request,
            bootstrapPrompt,
            resumeContext,
            threadContext,
            remainingBudget: threadRemainingBudget,
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
            signal: abortController.signal,
            onLine: (line) => {
              appendJobOutput(activeJob.id, line);
              outputTokenEstimate += estimateTokens(line);
            },
            onRuntimeApproval: provider === "codex" && this.config.runtimePolicy?.enabled !== false
              ? (request) => this.resolveRuntimeApprovalRequest(activeJob, request)
              : undefined,
            onRuntimeEvent: provider === "codex" && this.config.runtimePolicy?.enabled !== false
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

          if (bootstrapShouldApply && activeJob.threadId && this.repository) {
            try {
              const appliedAt = new Date().toISOString();
              this.repository.updateThread(activeJob.threadId, {
                bootstrapAppliedAt: appliedAt,
              });
              this.eventBus.publish({
                jobId: activeJob.id,
                chatId: activeJob.chatId,
                eventType: "thread_bootstrap_applied",
                message: "Thread bootstrap instructions applied for first run.",
                payload: {
                  threadId: activeJob.threadId,
                  appliedAt,
                },
              });
            } catch {
              // non-critical
            }
          }

          // Save new session ID to thread for future resumes
          if (result.newSessionId && activeJob.threadId && this.repository) {
            try {
              this.repository.updateThread(activeJob.threadId, {
                cliSessionId: result.newSessionId,
              });
            } catch {
              // non-critical
            }
          }

          const completedAt = new Date().toISOString();
          const exactTotal = Number.parseInt(String(result?.usage?.totalTokens || 0), 10);
          const exactInput = Number.parseInt(String(result?.usage?.inputTokens || 0), 10);
          const exactOutput = Number.parseInt(String(result?.usage?.outputTokens || 0), 10);
          const usageSource = Number.isFinite(exactTotal) && exactTotal > 0 ? "exact" : "estimate";
          const totalTokens = usageSource === "exact"
            ? Math.max(0, exactTotal)
            : inputTokenEstimate + outputTokenEstimate + estimateTokens(result.message);
          const inputTokens = usageSource === "exact"
            ? Math.max(0, exactInput)
            : inputTokenEstimate;
          const outputTokens = usageSource === "exact"
            ? Math.max(0, exactOutput)
            : outputTokenEstimate + estimateTokens(result.message);
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

          try {
            await this.sendChatText({
              chatId: activeJob.chatId,
              text: [
                `Job ${activeJob.id} complete`,
                `Project: ${activeJob.projectName}`,
                `Request: ${truncate(activeJob.request, 140)}`,
                "",
                truncate(result.message, 3000),
              ].join("\n"),
            });
          } catch (error) {
            console.error(`[job:${activeJob.id}] completed but failed to notify Telegram`, error);
          }
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
          const totalEstimate = inputTokenEstimate + outputTokenEstimate + estimateTokens(failureMessage);
          if (this.config.debug?.logTokenUsage) {
            console.log(
              `[job:${activeJob.id}] token_usage`,
              JSON.stringify(
                {
                  provider: this.state.getProvider(),
                  model: this.state.getModel() || this.config.runner?.model || "",
                  source: "estimate",
                  inputTokens: inputTokenEstimate,
                  outputTokens: outputTokenEstimate + estimateTokens(failureMessage),
                  totalTokens: totalEstimate,
                  usageRaw: null,
                },
                null,
                2,
              ),
            );
          }
          if (threadIdForBudget && totalEstimate > 0 && this.repository) {
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
            tokenSource: "estimate",
            tokenInput: inputTokenEstimate,
            tokenOutput: outputTokenEstimate + estimateTokens(failureMessage),
            tokenTotal: totalEstimate,
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

          try {
            await this.sendChatText({
              chatId: activeJob.chatId,
              text: failureMessage,
            });
          } catch (notifyError) {
            console.error(`[job:${activeJob.id}] failed and notification also failed`, notifyError);
          }
        } finally {
          this.abortControllers.delete(activeJob.id);
          if (progressTimer) {
            clearInterval(progressTimer);
          }
          this.state.markPendingConsumed(activeJob.chatId, activeJob.id);
          this.runningJobId = "";
          // Free streaming output buffer
          clearJobOutput(activeJob.id);
          this.enqueuedJobIds.delete(activeJob.id);
        }
      })
      .catch((error) => {
        console.error("Unhandled queue error", error);
        this.enqueuedJobIds.delete(job.id);
        this.runningJobId = "";
      });
  }
}
