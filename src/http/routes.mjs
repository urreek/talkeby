import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { resolveExecutionMode } from "../services/command-parser.mjs";
import { getJobOutput, subscribeJobOutput } from "../services/job-output.mjs";
import { buildObservabilitySummary } from "../services/observability.mjs";
import {
  getProviderMeta,
  supportedProviderText,
  SUPPORTED_PROVIDERS,
} from "../providers/catalog.mjs";
import { buildProviderCatalogWithDiscovery } from "../providers/discovery.mjs";
import {
  normalizeAgentProfileInput,
  resolveAgentProfile,
} from "../services/agent-profile.mjs";
import { registerEventRoute } from "./events-route.mjs";
import { registerJobRoutes } from "./jobs-routes.mjs";
import { isAuthorizedChat, textValue } from "./shared.mjs";

const execFileAsync = promisify(execFile);

async function checkBinary(name) {
  try {
    await execFileAsync("which", [name], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

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

const PROJECT_NAME_MAX_LENGTH = 64;

function sanitizeProjectName(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return "";
  }
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, PROJECT_NAME_MAX_LENGTH);
}

function makeUniqueProjectName(baseName, usedNamesLower) {
  const sanitizedBase = sanitizeProjectName(baseName);
  if (!sanitizedBase) {
    return "";
  }

  let candidate = sanitizedBase;
  let suffix = 2;
  while (usedNamesLower.has(candidate.toLowerCase())) {
    const suffixText = `-${suffix}`;
    const headMax = Math.max(1, PROJECT_NAME_MAX_LENGTH - suffixText.length);
    const head = sanitizedBase.slice(0, headMax).replace(/[._-]+$/, "");
    candidate = `${head}${suffixText}`;
    suffix += 1;
  }

  usedNamesLower.add(candidate.toLowerCase());
  return candidate;
}

function scanDiscoverableProjects(baseDir, existingNamesLower, existingPathsLower) {
  let entries = [];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return { basePath: baseDir, discovered: [] };
  }

  const discovered = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      const folderPath = path.join(baseDir, e.name);
      const suggestedProjectName = sanitizeProjectName(e.name);
      const alreadyAdded = existingNamesLower.has(String(e.name || "").toLowerCase())
        || existingPathsLower.has(path.resolve(folderPath).toLowerCase());

      return {
        name: e.name,
        suggestedProjectName,
        path: folderPath,
        alreadyAdded,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { basePath: baseDir, discovered };
}

function resolveRequestChatId(request, security) {
  const direct = textValue(request.body?.chatId || request.query?.chatId || "");
  if (direct) {
    return direct;
  }
  return textValue(security.resolveOwnerChatIdForRequest(request) || "");
}

export function registerRoutes({
  app,
  config,
  state,
  eventBus,
  jobRunner,
  repository,
  security,
}) {
  let providerCatalogCache = {
    fetchedAt: 0,
    providers: [],
  };

  async function resolveProviderCatalog() {
    const now = Date.now();
    if (now - providerCatalogCache.fetchedAt < 60_000) {
      return providerCatalogCache.providers;
    }

    const providers = await buildProviderCatalogWithDiscovery({
      config,
      log: app.log,
    });
    providerCatalogCache = {
      fetchedAt: now,
      providers,
    };
    return providers;
  }

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

  app.get("/api/security/access", async (request) => ({
    required: security.isOwnerKeyRequired(),
    authenticated: security.isOwnerKeyValidForRequest(request),
    ownerChatId: security.isOwnerKeyValidForRequest(request)
      ? (security.resolveOwnerChatIdForRequest(request) || security.getOwnerChatId() || null)
      : null,
  }));

  app.get("/api/security/csrf", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const issued = security.issueCsrfToken(chatId);
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  });

  app.get("/api/agent-profile", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required. Set OWNER_CHAT_ID or provide chatId." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const storedProfile = repository.getAgentProfile();
    return {
      profile: resolveAgentProfile(storedProfile),
    };
  });

  app.post("/api/agent-profile", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required. Set OWNER_CHAT_ID or provide chatId." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const profile = normalizeAgentProfileInput(request.body?.profile || "");
    repository.setAgentProfile(profile);

    return {
      ok: true,
      profile: resolveAgentProfile(profile),
    };
  });

  app.get("/api/doctor", async () => {
    const activeProvider = state.getProvider();
    const binaries = config.runner?.binaries || {};

    const checks = await Promise.all(
      SUPPORTED_PROVIDERS.map(async (provider) => {
        const meta = getProviderMeta(provider);
        const binaryName = binaries[meta?.binaryKey || provider] || provider;
        const envKey = meta?.builtInAuth ? "" : (meta?.envKey || "");
        const binaryInstalled = await checkBinary(binaryName);
        const apiKeySet = envKey ? Boolean(process.env[envKey]) : true;
        const ready = meta?.builtInAuth ? binaryInstalled : binaryInstalled && apiKeySet;

        return {
          provider,
          active: provider === activeProvider,
          binary: binaryName,
          binaryInstalled,
          envKey: envKey || null,
          apiKeySet,
          ready,
        };
      }),
    );

    const active = checks.find((c) => c.active);
    return {
      ok: active?.ready ?? false,
      activeProvider,
      providers: checks,
    };
  });

  app.get("/api/observability", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const daysRaw = Number.parseInt(String(request.query?.days || 7), 10);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 30)) : 7;

    const jobs = repository
      .listRecentJobs(5000)
      .filter((job) => String(job.chatId) === chatId);
    const runtimeApprovals = repository.listRuntimeApprovals({
      chatId,
      limit: 5000,
    });

    return buildObservabilitySummary({
      jobs,
      runtimeApprovals,
      windowDays: days,
    });
  });

  // ── Live output streaming (SSE) ──

  app.get("/api/jobs/:jobId/stream", async (request, reply) => {
    const jobId = textValue(request.params?.jobId || "");
    if (!jobId) {
      reply.code(400);
      return { error: "jobId is required." };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send existing buffered lines
    const existing = getJobOutput(jobId);
    for (const line of existing) {
      reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
    }

    // Subscribe for new lines
    const unsubscribe = subscribeJobOutput(jobId, (line) => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 15000);

    // Cleanup on close
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ── Thread routes ──

  app.get("/api/threads", async (request) => {
    const projectName = textValue(request.query?.project || "");
    if (!projectName) {
      return { threads: [] };
    }
    const threads = repository.listThreadsByProject(projectName);
    const enriched = threads.map((t) => {
      const jobs = repository.listJobsByThread(t.id, 1);
      const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
      return { ...t, latestJobStatus: latestJob?.status ?? null };
    });
    return { threads: enriched };
  });

  app.post("/api/threads", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const projectName = textValue(request.body?.projectName || "");
    const title = textValue(request.body?.title || "");

    if (!chatId || !projectName) {
      reply.code(400);
      return { error: "chatId and projectName are required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const id = `thr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const bootstrapPrompt = resolveAgentProfile(repository.getAgentProfile());
    const thread = repository.createThread({
      id,
      projectName,
      title: title || "New thread",
      bootstrapPrompt,
      tokenBudget: config.threads?.defaultTokenBudget ?? 12000,
      autoTrimContext: config.threads?.autoTrimContextDefault !== false,
    });
    return { thread };
  });

  app.get("/api/threads/:threadId/jobs", async (request) => {
    const threadId = textValue(request.params?.threadId || "");
    if (!threadId) {
      return { jobs: [] };
    }
    const jobs = repository.listJobsByThread(threadId);
    return { jobs };
  });

  app.delete("/api/threads/:threadId", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || request.query?.chatId || "");
    if (!chatId || !isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Not authorized." };
    }
    const threadId = textValue(request.params?.threadId || "");
    if (!threadId) {
      reply.code(400);
      return { error: "threadId is required." };
    }

    // Clean up Codex session file on disk
    const thread = repository.getThread(threadId);
    if (thread?.cliSessionId) {
      try {
        const sessionsDir = path.join(
          os.homedir(),
          ".codex",
          "sessions",
        );
        // Session files are stored as: YYYY/MM/DD/rollout-...-<UUID>.jsonl
        // We need to find the file by UUID suffix
        const result = execFileSync("find", [sessionsDir, "-name", `*${thread.cliSessionId}.jsonl`], {
          timeout: 5000,
          encoding: "utf8",
        }).trim();
        if (result) {
          for (const f of result.split("\n")) {
            if (f.trim()) fs.unlinkSync(f.trim());
          }
        }
      } catch {
        // Non-critical: session file cleanup is best-effort
      }
    }

    repository.deleteThread(threadId);
    return { ok: true };
  });

  app.delete("/api/projects/:name", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || request.query?.chatId || "");
    if (!chatId || !isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Not authorized." };
    }
    const name = textValue(request.params?.name || "");
    if (!name) {
      reply.code(400);
      return { error: "Project name is required." };
    }

    const removed = state.removeProject(name);
    if (removed.error) {
      reply.code(404);
      return { error: removed.error };
    }

    return {
      ok: true,
      projects: state.listProjects(),
    };
  });

  app.patch("/api/threads/:threadId", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId || !isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Not authorized." };
    }
    const threadId = textValue(request.params?.threadId || "");
    const title = textValue(request.body?.title || "");
    const tokenBudgetRaw = request.body?.tokenBudget;
    const autoTrimContextRaw = request.body?.autoTrimContext;
    const hasTokenBudget = tokenBudgetRaw !== undefined && tokenBudgetRaw !== null && `${tokenBudgetRaw}`.trim() !== "";
    const hasAutoTrimContext = autoTrimContextRaw !== undefined && autoTrimContextRaw !== null;
    const tokenBudgetParsed = hasTokenBudget
      ? Number.parseInt(String(tokenBudgetRaw), 10)
      : null;
    if (!threadId || (!title && !hasTokenBudget && !hasAutoTrimContext)) {
      reply.code(400);
      return { error: "threadId and at least one patch field are required." };
    }
    if (hasTokenBudget && !Number.isFinite(tokenBudgetParsed)) {
      reply.code(400);
      return { error: "tokenBudget must be an integer >= 0." };
    }
    const patch = {};
    if (title) {
      patch.title = title;
    }
    if (hasTokenBudget) {
      patch.tokenBudget = Math.max(0, tokenBudgetParsed);
    }
    if (hasAutoTrimContext) {
      patch.autoTrimContext = Boolean(autoTrimContextRaw);
    }
    const thread = repository.updateThread(threadId, patch);
    return { thread };
  });

  app.get("/api/mode", async (request) => {
    const chatId = resolveRequestChatId(request, security);
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
    const chatId = resolveRequestChatId(request, security);
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
      reasoningEffort: state.getReasoningEffort(),
      planMode: state.getPlanMode(),
      supported: SUPPORTED_PROVIDERS,
    };
  });

  app.get("/api/provider/catalog", async () => {
    const providers = await resolveProviderCatalog();
    return { providers };
  });

  app.post("/api/provider", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
    const providerName = request.body?.provider;
    const modelName = request.body?.model;
    const reasoningEffort = request.body?.reasoningEffort;
    const planMode = request.body?.planMode;

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
      const requestedProvider = textValue(providerName).toLowerCase();
      const resolved = state.setProvider(requestedProvider);
      if (!resolved) {
        reply.code(400);
        return {
          error: `Unknown provider "${providerName}". Supported: ${supportedProviderText()}.`,
        };
      }
      if (modelName === undefined) {
        state.setModel("");
      }
    }

    // Update model if provided
    if (modelName !== undefined) {
      const normalizedModel = textValue(modelName);
      const selectedProvider = state.getProvider();
      const providerMeta = getProviderMeta(selectedProvider);
      if (
        config.runner?.freeModelsOnly
        && providerMeta
        && providerMeta.freeOnlyModels.length > 0
        && normalizedModel
        && !providerMeta.freeOnlyModels.includes(normalizedModel)
      ) {
        reply.code(400);
        return {
          error: `Model "${normalizedModel}" is not allowed while FREE_MODELS_ONLY=true for provider "${selectedProvider}".`,
          code: "model_not_allowed",
        };
      }
      state.setModel(normalizedModel);
    }

    // Update reasoning effort if provided
    if (reasoningEffort !== undefined) {
      state.setReasoningEffort(textValue(reasoningEffort));
    }

    // Update plan mode if provided
    if (planMode !== undefined) {
      state.setPlanMode(planMode);
    }

    return {
      provider: state.getProvider(),
      model: state.getModel(),
      reasoningEffort: state.getReasoningEffort(),
      planMode: state.getPlanMode(),
    };
  });

  app.get("/api/projects", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
    if (!chatId) {
      reply.code(400);
      return {
        error: "chatId is required. Set OWNER_CHAT_ID or provide chatId.",
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

  app.get("/api/projects/discover", async () => {
    const baseDir = config.codex.projectsBaseDir;
    const existingProjects = state.listProjects();
    const existingNames = new Set(
      existingProjects.map((p) => String(p.name || "").toLowerCase()),
    );
    const existingPaths = new Set(
      existingProjects.map((p) => path.resolve(String(p.path || "")).toLowerCase()),
    );
    return scanDiscoverableProjects(baseDir, existingNames, existingPaths);
  });

  app.post("/api/projects/import-all", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required. Set OWNER_CHAT_ID or provide chatId." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const baseDir = config.codex.projectsBaseDir;
    const existingProjects = state.listProjects();
    const existingNames = new Set(
      existingProjects.map((p) => String(p.name || "").toLowerCase()),
    );
    const existingPaths = new Set(
      existingProjects.map((p) => path.resolve(String(p.path || "")).toLowerCase()),
    );
    const scan = scanDiscoverableProjects(baseDir, existingNames, existingPaths);
    const reservedNames = new Set(existingNames);

    const imported = [];
    const skipped = [];
    const errors = [];

    for (const folder of scan.discovered) {
      if (folder.alreadyAdded) {
        skipped.push(folder.name);
        continue;
      }
      const safeName = makeUniqueProjectName(folder.suggestedProjectName || folder.name, reservedNames);
      if (!safeName) {
        errors.push({
          name: folder.name,
          error: "Could not derive a valid project name for this folder.",
        });
        continue;
      }
      const created = state.addProject({
        projectName: safeName,
        projectPath: folder.path,
        createdByChatId: chatId,
      });
      if (created.error) {
        errors.push({ name: folder.name, error: created.error });
        continue;
      }
      imported.push(created.project.name);
    }

    return {
      ok: true,
      basePath: baseDir,
      imported,
      skipped,
      errors,
      projects: state.listProjects(),
    };
  });

  app.post("/api/projects/select", async (request, reply) => {
    const chatId = resolveRequestChatId(request, security);
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
    const chatId = resolveRequestChatId(request, security);
    const projectName = textValue(request.body?.projectName || request.body?.name || "");
    const requestedPath = textValue(request.body?.path || "");
    const setActive = parseBoolean(request.body?.setActive, true);

    if (!chatId || (!projectName && !requestedPath)) {
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

    const existingProjects = state.listProjects();
    const resolvedPathLower = path.resolve(resolvedPath).toLowerCase();
    const existingByPath = existingProjects.find(
      (p) => path.resolve(String(p.path || "")).toLowerCase() === resolvedPathLower,
    );
    if (existingByPath) {
      if (setActive) {
        state.setProjectForChat(chatId, existingByPath.name);
      }
      return {
        ok: true,
        alreadyExists: true,
        chatId,
        projectName: existingByPath.name,
        path: existingByPath.path,
        basePath: config.codex.projectsBaseDir,
        activeProject: setActive ? existingByPath.name : state.getProjectForChat(chatId).name,
        projects: state.listProjects(),
      };
    }

    const safeName = sanitizeProjectName(projectName) || sanitizeProjectName(path.basename(resolvedPath));
    if (!safeName) {
      reply.code(400);
      return { error: "Invalid project name. Use letters, numbers, dots, underscores, or dashes." };
    }

    const existingNames = new Set(
      existingProjects.map((p) => String(p.name || "").toLowerCase()),
    );
    if (existingNames.has(safeName.toLowerCase())) {
      reply.code(400);
      return { error: `Project ${safeName} already exists.` };
    }

    const created = state.addProject({
      projectName: safeName,
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

  app.get("/api/runtime-approvals", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const status = textValue(request.query?.status || "");
    const jobId = textValue(request.query?.jobId || "");
    const limitInput = Number.parseInt(String(request.query?.limit || 50), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 500)) : 50;

    const approvals = state.listRuntimeApprovals({
      chatId,
      status,
      jobId,
      limit,
    });
    return { approvals };
  });

  app.post("/api/runtime-approvals/:id/approve", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const id = textValue(request.params?.id || "");
    const existing = state.getRuntimeApprovalById(id);
    if (!existing) {
      reply.code(404);
      return { error: "Runtime approval not found." };
    }
    if (String(existing.chatId) !== chatId) {
      reply.code(403);
      return { error: "Runtime approval does not belong to this chat." };
    }

    const resolved = state.resolveRuntimeApproval({
      id,
      status: "approved",
      resolvedByChatId: chatId,
    }) || state.getRuntimeApprovalById(id);
    state.resolveRuntimeApprovalDecision({
      id,
      decision: "approve",
    });

    eventBus.publish({
      jobId: existing.jobId,
      chatId,
      eventType: "runtime_approval_user_approved",
      message: "Runtime approval approved by user.",
      payload: {
        approvalId: id,
      },
    });

    return {
      ok: true,
      approval: resolved,
    };
  });

  app.post("/api/runtime-approvals/:id/deny", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const id = textValue(request.params?.id || "");
    const existing = state.getRuntimeApprovalById(id);
    if (!existing) {
      reply.code(404);
      return { error: "Runtime approval not found." };
    }
    if (String(existing.chatId) !== chatId) {
      reply.code(403);
      return { error: "Runtime approval does not belong to this chat." };
    }

    const resolved = state.resolveRuntimeApproval({
      id,
      status: "denied",
      resolvedByChatId: chatId,
    }) || state.getRuntimeApprovalById(id);
    state.resolveRuntimeApprovalDecision({
      id,
      decision: "deny",
    });

    eventBus.publish({
      jobId: existing.jobId,
      chatId,
      eventType: "runtime_approval_user_denied",
      message: "Runtime approval denied by user.",
      payload: {
        approvalId: id,
      },
    });

    return {
      ok: true,
      approval: resolved,
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
