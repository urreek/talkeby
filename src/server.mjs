import fastify from "fastify";

import { loadConfig } from "./config.mjs";
import { createDatabase } from "./db/database.mjs";
import { TalkebyRepository } from "./db/repository.mjs";
import { registerRoutes } from "./http/routes.mjs";
import { registerSecurityHooks } from "./http/security.mjs";
import { CodexThreadSync } from "./services/codex-thread-sync.mjs";
import { EventBus } from "./services/event-bus.mjs";
import { JobRunner } from "./services/job-runner.mjs";
import { RuntimeState } from "./services/runtime-state.mjs";
import { TerminalManager } from "./services/terminal-manager.mjs";

function safeList(items) {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.join(", ");
}

async function start() {
  const config = loadConfig();
  const app = fastify({
    logger: true,
  });
  const { db } = createDatabase({
    filePath: config.storage.databaseFile,
  });
  const repository = new TalkebyRepository(db);
  const threadSync = new CodexThreadSync({
    config,
    repository,
    log: app.log,
  });
  await threadSync.ensureSynced({ force: true });
  const state = new RuntimeState({
    config,
    repository,
  });
  state.hydrate();

  const eventBus = new EventBus(repository);
  const terminalManager = new TerminalManager({
    defaultCwd: config.codex.workdir,
    log: app.log,
  });
  const jobRunner = new JobRunner({
    config,
    state,
    eventBus,
    repository,
    threadSync,
  });
  const startupRecovery = state.consumeStartupRecovery();
  for (const job of startupRecovery.failedJobs) {
    eventBus.publish({
      jobId: job.id,
      chatId: job.chatId,
      eventType: "job_failed",
      message: String(job.error || "Talkeby restarted while this job was running."),
      payload: {
        failedAt: job.completedAt,
        reason: "startup_recovery",
      },
    });
  }
  for (const job of startupRecovery.queuedJobs) {
    jobRunner.enqueue(job);
  }

  const security = registerSecurityHooks({
    app,
    config,
  });

  registerRoutes({
    app,
    config,
    state,
    eventBus,
    jobRunner,
    repository,
    security,
    terminalManager,
    threadSync,
  });

  await app.listen({
    port: config.port,
    host: "0.0.0.0",
  });

  app.log.info(`Default execution mode: ${config.app.defaultExecutionMode}`);
  app.log.info(`Codex default project: ${config.codex.defaultProjectName}`);
  app.log.info(`Codex projects: ${safeList(state.availableProjectNames())}`);
  app.log.info(`Workspace directory: ${config.codex.workdir}`);
  app.log.info(`Codex sandbox mode: ${config.codex.sandboxMode}`);
  app.log.info(`Database file: ${config.storage.databaseFile}`);
  app.log.info(`App access key: ${config.security.ownerKey ? "enabled" : "disabled"}`);
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", error);
  process.exitCode = 1;
});
