import { resolveExecutionMode } from "../services/command-parser.mjs";
import { registerEventRoute } from "./events-route.mjs";
import { registerJobRoutes } from "./jobs-routes.mjs";
import { isAuthorizedChat, textValue } from "./shared.mjs";

export function registerRoutes({
  app,
  config,
  state,
  eventBus,
  jobRunner,
  repository,
}) {
  app.get("/health", async () => ({
    ok: true,
    runningJobId: jobRunner.getRunningJobId(),
    queuedJobs: state.countQueuedJobs(),
    defaultExecutionMode: config.telegram.defaultExecutionMode,
    defaultProject: config.codex.defaultProjectName,
    projects: Object.fromEntries(config.codex.projects),
    workdir: config.codex.workdir,
    databaseFile: config.storage.databaseFile,
  }));

  app.get("/api/health", async () => ({
    ok: true,
    runningJobId: jobRunner.getRunningJobId(),
    queuedJobs: state.countQueuedJobs(),
    defaultExecutionMode: config.telegram.defaultExecutionMode,
    defaultProject: config.codex.defaultProjectName,
    projects: Object.fromEntries(config.codex.projects),
    workdir: config.codex.workdir,
    databaseFile: config.storage.databaseFile,
  }));

  app.get("/api/mode", async (request) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      return {
        defaultExecutionMode: config.telegram.defaultExecutionMode,
      };
    }
    return {
      chatId,
      executionMode: state.getExecutionModeForChat(chatId),
    };
  });

  app.post("/api/mode", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const mode = resolveExecutionMode(request.body?.mode || "");

    if (!chatId || !mode) {
      reply.code(400);
      return {
        error: "chatId and mode are required (mode: auto|interactive).",
      };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    state.setExecutionModeForChat(chatId, mode);
    return {
      chatId,
      executionMode: mode,
    };
  });

  app.get("/api/projects", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return {
        error: "chatId is required.",
      };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return {
        error: "Chat is not authorized.",
      };
    }

    const activeProject = state.getProjectForChat(chatId).name;
    return {
      activeProject,
      projects: state.availableProjectNames().map((name) => ({
        name,
        path: config.codex.projects.get(name),
      })),
    };
  });

  app.post("/api/projects/select", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const requestedName = textValue(request.body?.projectName || "");
    const projectName = state.resolveProjectName(requestedName);

    if (!chatId || !projectName) {
      reply.code(400);
      return {
        error: "chatId and valid projectName are required.",
      };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    state.setProjectForChat(chatId, projectName);
    return {
      chatId,
      projectName,
      path: config.codex.projects.get(projectName),
    };
  });

  registerJobRoutes({
    app,
    config,
    state,
    eventBus,
    jobRunner,
    repository,
  });

  registerEventRoute(app, eventBus, config);
}
