import { getRunner } from "../runners/index.mjs";
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

function buildRunningUpdate(job, startedAtMs) {
  return [
    `Job ${job.id} is still running.`,
    `Project: ${job.projectName}`,
    `Elapsed: ${formatDuration(Date.now() - startedAtMs)}`,
  ].join("\n");
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
  }

  getRunningJobId() {
    return this.runningJobId || null;
  }

  enqueue(job) {
    this.queue = this.queue
      .then(async () => {
        this.runningJobId = job.id;
        const startedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();

        this.state.patchJob(job.id, {
          status: "running",
          startedAt: startedAtIso,
        });

        // Auto-title thread from first user message
        if (job.threadId && this.repository) {
          try {
            const thread = this.repository.getThread(job.threadId);
            if (thread && thread.title === "New Thread") {
              const title = truncate(job.request, 60);
              this.repository.updateThread(job.threadId, { title });
            }
          } catch {
            // non-critical
          }
        }
        this.eventBus.publish({
          jobId: job.id,
          chatId: job.chatId,
          eventType: "job_running",
          message: "Job execution started.",
          payload: {
            startedAt: startedAtIso,
            projectName: job.projectName,
            workdir: job.workdir,
          },
        });

        try {
          await this.sendChatText({
            chatId: job.chatId,
            text: [
              `Job ${job.id} started.`,
              `Project: ${job.projectName}`,
              `Path: ${job.workdir}`,
            ].join("\n"),
          });
        } catch (error) {
          console.error(`[job:${job.id}] failed to send running notification`, error);
        }

        let progressTimer = null;
        if (this.config.telegram.progressUpdates) {
          progressTimer = setInterval(() => {
            const message = buildRunningUpdate(job, startedAtMs);
            this.eventBus.publish({
              jobId: job.id,
              chatId: job.chatId,
              eventType: "job_progress",
              message,
              payload: {
                elapsedMs: Date.now() - startedAtMs,
              },
            });
            this.sendChatText({
              chatId: job.chatId,
              text: message,
            }).catch((error) => {
              console.error(`[job:${job.id}] failed to send progress update`, error);
            });
          }, this.config.telegram.progressUpdateSeconds * 1000);

          if (typeof progressTimer.unref === "function") {
            progressTimer.unref();
          }
        }

        try {
          const provider = this.state.getProvider();
          const providerConfig = this.config.runner;
          const runner = getRunner(provider);
          const model = this.state.getModel() || providerConfig.model;
          const reasoningEffort = this.state.getReasoningEffort();
          const planMode = this.state.getPlanMode();

          // Look up thread's CLI session ID for continuity
          let sessionId = null;
          if (job.threadId && this.repository) {
            try {
              const thread = this.repository.getThread(job.threadId);
              sessionId = thread?.cliSessionId || null;
            } catch {
              // non-critical
            }
          }

          const result = await runner({
            task: job.request,
            workdir: job.workdir,
            model,
            reasoningEffort,
            planMode,
            timeoutMs: providerConfig.timeoutMs,
            binary: providerConfig.binaries[provider] || provider,
            sessionId,
            onLine: (line) => appendJobOutput(job.id, line),
          });

          // Save new session ID to thread for future resumes
          if (result.newSessionId && job.threadId && this.repository) {
            try {
              this.repository.updateThread(job.threadId, {
                cliSessionId: result.newSessionId,
              });
            } catch {
              // non-critical
            }
          }

          const completedAt = new Date().toISOString();
          this.state.patchJob(job.id, {
            status: "completed",
            completedAt,
            summary: result.message,
            error: "",
          });
          this.eventBus.publish({
            jobId: job.id,
            chatId: job.chatId,
            eventType: "job_completed",
            message: "Job completed successfully.",
            payload: {
              completedAt,
            },
          });

          try {
            await this.sendChatText({
              chatId: job.chatId,
              text: [
                `Job ${job.id} complete`,
                `Project: ${job.projectName}`,
                `Request: ${truncate(job.request, 140)}`,
                "",
                truncate(result.message, 3000),
              ].join("\n"),
            });
          } catch (error) {
            console.error(`[job:${job.id}] completed but failed to notify Telegram`, error);
          }
        } catch (error) {
          const failedAt = new Date().toISOString();
          const failureMessage = truncate(error.message, 3000);
          this.state.patchJob(job.id, {
            status: "failed",
            completedAt: failedAt,
            error: failureMessage,
          });
          this.eventBus.publish({
            jobId: job.id,
            chatId: job.chatId,
            eventType: "job_failed",
            message: failureMessage,
            payload: {
              failedAt,
            },
          });

          try {
            await this.sendChatText({
              chatId: job.chatId,
              text: failureMessage,
            });
          } catch (notifyError) {
            console.error(`[job:${job.id}] failed and notification also failed`, notifyError);
          }
        } finally {
          if (progressTimer) {
            clearInterval(progressTimer);
          }
          this.state.markPendingConsumed(job.chatId, job.id);
          this.runningJobId = "";
          // Free streaming output buffer
          clearJobOutput(job.id);
        }
      })
      .catch((error) => {
        console.error("Unhandled queue error", error);
        this.runningJobId = "";
      });
  }
}
