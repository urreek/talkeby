import fs from "node:fs";
import path from "node:path";

import { resolveExecutionMode } from "../services/command-parser.mjs";
import { registerEventRoute } from "./events-route.mjs";
import { registerJobRoutes } from "./jobs-routes.mjs";
import { isAuthorizedChat, textValue } from "./shared.mjs";

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

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
    projectsBaseDir: config.codex.projectsBaseDir,
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
    projectsBaseDir: config.codex.projectsBaseDir,
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

  app.get("/api/provider", async () => {
    return {
      provider: state.getProvider(),
      model: state.getModel(),
      supported: ["codex", "claude", "gemini"],
    };
  });

  app.post("/api/provider", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const providerName = request.body?.provider;
    const modelName = request.body?.model;

    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    // Update provider if provided
    if (providerName !== undefined) {
      const resolved = state.setProvider(textValue(providerName));
      if (!resolved) {
        reply.code(400);
        return {
          error: `Unknown provider "${providerName}". Supported: codex, claude, gemini.`,
        };
      }
    }

    // Update model if provided
    if (modelName !== undefined) {
      state.setModel(textValue(modelName));
    }

    return {
      provider: state.getProvider(),
      model: state.getModel(),
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
      basePath: config.codex.projectsBaseDir,
      projects: state.listProjects(),
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

  app.post("/api/projects", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const projectName = textValue(request.body?.projectName || request.body?.name || "");
    const requestedPath = textValue(request.body?.path || "");
    const setActive = parseBoolean(request.body?.setActive, true);

    if (!chatId || !projectName) {
      reply.code(400);
      return {
        error: "chatId and projectName are required.",
      };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const candidatePath = requestedPath || projectName;
    const resolvedPath = path.isAbsolute(candidatePath)
      ? path.resolve(candidatePath)
      : path.resolve(config.codex.projectsBaseDir, candidatePath);
    try {
      fs.mkdirSync(resolvedPath, { recursive: true });
    } catch (error) {
      reply.code(400);
      return { error: `Could not create project path: ${error.message}` };
    }

    let stat;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      reply.code(400);
      return { error: "Project path is not accessible." };
    }
    if (!stat.isDirectory()) {
      reply.code(400);
      return { error: "Project path must be a directory." };
    }

    const created = state.addProject({
      projectName,
      projectPath: resolvedPath,
      createdByChatId: chatId,
    });
    if (created.error) {
      reply.code(400);
      return { error: created.error };
    }

    if (setActive) {
      state.setProjectForChat(chatId, created.project.name);
    }

    return {
      ok: true,
      chatId,
      projectName: created.project.name,
      path: created.project.path,
      basePath: config.codex.projectsBaseDir,
      activeProject: setActive ? created.project.name : state.getProjectForChat(chatId).name,
      projects: state.listProjects(),
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
