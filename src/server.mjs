import fastify from "fastify";

import { loadConfig } from "./config.mjs";
import { createDatabase } from "./db/database.mjs";
import { TalkebyRepository } from "./db/repository.mjs";
import { registerRoutes } from "./http/routes.mjs";
import { registerSecurityHooks } from "./http/security.mjs";
import { EventBus } from "./services/event-bus.mjs";
import { JobRunner } from "./services/job-runner.mjs";
import { RuntimeState } from "./services/runtime-state.mjs";
import { createTelegramMessenger, pollTelegramForever } from "./telegram/worker.mjs";

function safeList(items) {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.join(", ");
}

async function start() {
  const config = loadConfig();
  const { db } = createDatabase({
    filePath: config.storage.databaseFile,
  });
  const repository = new TalkebyRepository(db);
  const state = new RuntimeState({
    config,
    repository,
  });
  state.hydrate();

  const eventBus = new EventBus(repository);
  const sendChatText = createTelegramMessenger(config);
  const jobRunner = new JobRunner({
    config,
    state,
    eventBus,
    sendChatText,
    repository,
  });

  const app = fastify({
    logger: true,
  });

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
  });

  await app.listen({
    port: config.port,
    host: "0.0.0.0",
  });

  app.log.info(`Allowed chats: ${state.safeAllowedChats()}`);
  app.log.info(`Default execution mode: ${config.telegram.defaultExecutionMode}`);
  app.log.info(`Codex default project: ${config.codex.defaultProjectName}`);
  app.log.info(`Codex projects: ${safeList(state.availableProjectNames())}`);
  app.log.info(`Codex workdir: ${config.codex.workdir}`);
  app.log.info(`Database file: ${config.storage.databaseFile}`);
  app.log.info(`App access key: ${config.security.ownerKey ? "enabled" : "disabled"}`);

  pollTelegramForever({
    config,
    app,
    state,
    eventBus,
    jobRunner,
    sendChatText,
  }).catch((error) => {
    app.log.error({ err: error }, "Fatal Telegram worker error");
    process.exitCode = 1;
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", error);
  process.exitCode = 1;
});
