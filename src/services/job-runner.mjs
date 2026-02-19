import { runCodex } from "../codex.mjs";

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
  constructor({ config, state, eventBus, sendChatText }) {
    this.config = config;
    this.state = state;
    this.eventBus = eventBus;
    this.sendChatText = sendChatText;

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
          const result = await runCodex({
            transcript: job.request,
            codexConfig: {
              ...this.config.codex,
              workdir: job.workdir,
            },
          });

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
          const failureMessage = `Job ${job.id} failed: ${truncate(error.message, 3000)}`;
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
        }
      })
      .catch((error) => {
        console.error("Unhandled queue error", error);
        this.runningJobId = "";
      });
  }
}
