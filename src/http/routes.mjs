import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
import {
  serializeJob,
  serializeJobs,
  serializeRuntimeApproval,
  serializeRuntimeApprovals,
} from "./serializers.mjs";
import { textValue } from "./shared.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_NAME_MAX_LENGTH = 64;

async function checkBinary(name) {
  const candidate = String(name || "").trim();
  if (!candidate) {
    return false;
  }

  if (
    path.isAbsolute(candidate)
    || candidate.includes("/")
    || candidate.includes("\\")
  ) {
    try {
      fs.accessSync(candidate, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const locator = process.platform === "win32" ? "where" : "which";
    await execFileAsync(locator, [candidate], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function canWriteDirectory(dirPath) {
  const safeDir = String(dirPath || "").trim();
  if (!safeDir) {
    return false;
  }
  try {
    fs.mkdirSync(safeDir, { recursive: true });
    fs.accessSync(safeDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const folderPath = path.join(baseDir, entry.name);
      const suggestedProjectName = sanitizeProjectName(entry.name);
      const alreadyAdded = existingNamesLower.has(String(entry.name || "").toLowerCase())
        || existingPathsLower.has(path.resolve(folderPath).toLowerCase());

      return {
        name: entry.name,
        suggestedProjectName,
        path: folderPath,
        alreadyAdded,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return { basePath: baseDir, discovered };
}

function summarizeHealth({
  jobRunner,
  config,
  state,
}) {
  return {
    ok: true,
    runningJobId: jobRunner.getRunningJobId(),
    queuedJobs: state.countQueuedJobs(),
    defaultExecutionMode: config.app.defaultExecutionMode,
    defaultProject: config.codex.defaultProjectName,
    activeProject: state.getProject().name,
    projects: Object.fromEntries(config.codex.projects),
    projectsBaseDir: config.codex.projectsBaseDir,
    workdir: config.codex.workdir,
    databaseFile: config.storage.databaseFile,
  };
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

  app.get("/health", async () => summarizeHealth({
    jobRunner,
    config,
    state,
  }));

  app.get("/api/health", async () => summarizeHealth({
    jobRunner,
    config,
    state,
  }));

  app.get("/api/auth/session", async (request) => security.getSessionStatus(request));

  app.post("/api/auth/login", async (request, reply) => {
    const accessKey = textValue(request.body?.accessKey || "");
    if (!security.isValidOwnerKey(accessKey)) {
      reply.code(401);
      return {
        error: "Invalid access key.",
      };
    }

    const issued = security.issueOwnerSession(reply, request);
    return {
      ok: true,
      required: security.isOwnerKeyRequired(),
      authenticated: true,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    security.clearOwnerSession(reply, request);
    return { ok: true };
  });

  app.get("/api/security/csrf", async (request, reply) => {
    const issued = security.issueCsrfToken(request);
    if (!issued) {
      reply.code(401);
      return {
        error: "Authentication required.",
      };
    }
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  });

  app.get("/api/agent-profile", async () => ({
    profile: resolveAgentProfile(repository.getAgentProfile()),
  }));

  app.post("/api/agent-profile", async (request) => {
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

    const providerChecks = await Promise.all(
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

    const checks = [];
    const addCheck = ({
      id,
      ok,
      severity = "info",
      message,
      fix = "",
    }) => {
      checks.push({
        id: String(id || ""),
        ok: Boolean(ok),
        severity,
        message: String(message || ""),
        fix: fix ? String(fix) : null,
      });
    };

    const dbParent = path.dirname(String(config.storage?.databaseFile || ""));
    const dataDir = String(config.storage?.dataDir || "");
    const dbParentWritable = canWriteDirectory(dbParent);
    const dataDirWritable = canWriteDirectory(dataDir);
    const appAccessKeySet = Boolean(String(config.security?.ownerKey || "").trim());
    const cloudflaredInstalled = await checkBinary("cloudflared");
    const tunnelTokenSet = Boolean(String(process.env.CLOUDFLARE_TUNNEL_TOKEN || "").trim());

    addCheck({
      id: "node_version",
      ok: true,
      severity: "info",
      message: `Node ${process.versions.node}`,
    });
    addCheck({
      id: "database_dir_writable",
      ok: dbParentWritable,
      severity: dbParentWritable ? "info" : "error",
      message: dbParentWritable
        ? `Database directory writable: ${dbParent}`
        : `Database directory not writable: ${dbParent}`,
      fix: dbParentWritable ? "" : `Create/write access for ${dbParent}`,
    });
    addCheck({
      id: "data_dir_writable",
      ok: dataDirWritable,
      severity: dataDirWritable ? "info" : "error",
      message: dataDirWritable
        ? `Data directory writable: ${dataDir}`
        : `Data directory not writable: ${dataDir}`,
      fix: dataDirWritable ? "" : `Create/write access for ${dataDir}`,
    });
    addCheck({
      id: "app_access_key",
      ok: appAccessKeySet,
      severity: appAccessKeySet ? "info" : "warning",
      message: appAccessKeySet
        ? "APP_ACCESS_KEY configured."
        : "APP_ACCESS_KEY missing; remote web access is not protected.",
      fix: appAccessKeySet ? "" : "Set APP_ACCESS_KEY in .env before internet exposure.",
    });
    addCheck({
      id: "cloudflared_binary",
      ok: cloudflaredInstalled,
      severity: cloudflaredInstalled ? "info" : "warning",
      message: cloudflaredInstalled
        ? "cloudflared is installed."
        : "cloudflared is not installed.",
      fix: cloudflaredInstalled ? "" : "Install cloudflared for internet tunneling.",
    });
    addCheck({
      id: "cloudflare_tunnel_token",
      ok: true,
      severity: "info",
      message: tunnelTokenSet
        ? "CLOUDFLARE_TUNNEL_TOKEN is set."
        : "CLOUDFLARE_TUNNEL_TOKEN is not set for Talkeby's built-in tunnel helper.",
      fix: tunnelTokenSet
        ? ""
        : "Optional: set CLOUDFLARE_TUNNEL_TOKEN only if you want Talkeby to launch a persistent Cloudflare tunnel itself.",
    });

    const backendPort = parseInteger(process.env.PORT, 3000);
    const webPort = parseInteger(process.env.WEB_PORT, 5173);
    addCheck({
      id: "ports",
      ok: backendPort > 0 && webPort > 0,
      severity: backendPort > 0 && webPort > 0 ? "info" : "error",
      message: `Configured ports: backend=${backendPort}, web=${webPort}`,
      fix: backendPort > 0 && webPort > 0 ? "" : "Set valid PORT and WEB_PORT integers in .env.",
    });

    const active = providerChecks.find((entry) => entry.active);
    const failureCount = checks.filter((check) => check.severity === "error" && !check.ok).length;
    const warningCount = checks.filter((check) => check.severity === "warning" && !check.ok).length;

    return {
      ok: Boolean(active?.ready) && failureCount === 0,
      activeProvider,
      providers: providerChecks,
      summary: {
        failures: failureCount,
        warnings: warningCount,
      },
      checks,
    };
  });

  app.get("/api/observability", async (request) => {
    const daysRaw = Number.parseInt(String(request.query?.days || 7), 10);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 30)) : 7;
    const jobs = repository.listRecentJobs(5000);
    const runtimeApprovals = repository.listRuntimeApprovals({
      limit: 5000,
    });

    return buildObservabilitySummary({
      jobs,
      runtimeApprovals,
      windowDays: days,
    });
  });

  app.get("/api/jobs/:jobId/stream", async (request, reply) => {
    const jobId = textValue(request.params?.jobId || "");
    const threadId = textValue(request.query?.threadId || "");
    if (!jobId) {
      reply.code(400);
      return { error: "jobId is required." };
    }

    const job = state.getJobById(jobId);
    if (!job) {
      reply.code(404);
      return { error: "Job not found." };
    }
    if (threadId && String(job.threadId || "") !== threadId) {
      reply.code(404);
      return { error: "Job does not belong to the requested thread." };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const existing = getJobOutput(jobId);
    for (const line of existing) {
      reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
    }

    const unsubscribe = subscribeJobOutput(jobId, (line) => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get("/api/threads", async (request) => {
    const projectName = textValue(request.query?.project || "");
    const limitInput = Number.parseInt(String(request.query?.limit || 50), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 200)) : 50;
    const threads = (() => {
      if (!projectName) {
        return repository.listRecentThreads(limit);
      }

      const resolvedProjectName = state.resolveProjectName(projectName);
      if (!resolvedProjectName) {
        return [];
      }
      return repository.listThreadsByProject(resolvedProjectName);
    })();
    const enriched = threads.map((thread) => {
      const jobs = repository.listJobsByThread(thread.id, 1);
      const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
      return { ...thread, latestJobStatus: latestJob?.status ?? null };
    });
    return { threads: enriched };
  });

  app.post("/api/threads", async (request, reply) => {
    const projectName = textValue(request.body?.projectName || "");
    const title = textValue(request.body?.title || "");
    const resolvedProjectName = state.resolveProjectName(projectName);

    if (!resolvedProjectName) {
      reply.code(400);
      return { error: "projectName is required." };
    }

    const id = crypto.randomUUID();
    const bootstrapPrompt = resolveAgentProfile(repository.getAgentProfile());
    const thread = repository.createThread({
      id,
      projectName: resolvedProjectName,
      title: title || "New thread",
      bootstrapPrompt,
      tokenBudget: config.threads?.defaultTokenBudget ?? 12000,
      autoTrimContext: config.threads?.autoTrimContextDefault !== false,
    });
    return { thread };
  });

  app.get("/api/threads/:threadId/jobs", async (request, reply) => {
    const threadId = textValue(request.params?.threadId || "");
    if (!threadId) {
      reply.code(400);
      return { error: "threadId is required." };
    }

    const thread = repository.getThread(threadId);
    if (!thread) {
      reply.code(404);
      return { error: "Thread not found." };
    }

    const jobs = repository.listJobsByThread(threadId);
    return { jobs: serializeJobs(jobs) };
  });

  app.delete("/api/threads/:threadId", async (request, reply) => {
    const threadId = textValue(request.params?.threadId || "");
    if (!threadId) {
      reply.code(400);
      return { error: "threadId is required." };
    }

    const thread = repository.getThread(threadId);
    if (!thread) {
      reply.code(404);
      return { error: "Thread not found." };
    }

    if (thread.cliSessionId) {
      try {
        const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
        const result = execFileSync("find", [sessionsDir, "-name", `*${thread.cliSessionId}.jsonl`], {
          timeout: 5000,
          encoding: "utf8",
        }).trim();
        if (result) {
          for (const sessionFile of result.split("\n")) {
            if (sessionFile.trim()) {
              fs.unlinkSync(sessionFile.trim());
            }
          }
        }
      } catch {
        // Best-effort local session cleanup.
      }
    }

    repository.deleteThread(threadId);
    return { ok: true };
  });

  app.patch("/api/threads/:threadId", async (request, reply) => {
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
    if (!repository.getThread(threadId)) {
      reply.code(404);
      return { error: "Thread not found." };
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

  app.get("/api/mode", async () => ({
    executionMode: state.getExecutionMode(),
  }));

  app.post("/api/mode", async (request, reply) => {
    const mode = textValue(request.body?.mode || "");
    const updatedMode = state.setExecutionMode(mode);
    if (!updatedMode) {
      reply.code(400);
      return {
        error: "mode is required (auto|interactive).",
      };
    }
    return {
      executionMode: updatedMode,
    };
  });

  app.get("/api/provider", async () => ({
    provider: state.getProvider(),
    model: state.getModel(),
    reasoningEffort: state.getReasoningEffort(),
    planMode: state.getPlanMode(),
    supported: SUPPORTED_PROVIDERS,
  }));

  app.get("/api/provider/catalog", async () => {
    const providers = await resolveProviderCatalog();
    return { providers };
  });

  app.post("/api/provider", async (request, reply) => {
    const providerName = request.body?.provider;
    const modelName = request.body?.model;
    const reasoningEffort = request.body?.reasoningEffort;
    const planMode = request.body?.planMode;

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

    if (reasoningEffort !== undefined) {
      state.setReasoningEffort(textValue(reasoningEffort));
    }

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

  app.get("/api/projects", async () => ({
    activeProject: state.getProject().name,
    basePath: config.codex.projectsBaseDir,
    projects: state.listProjects(),
  }));

  app.get("/api/projects/discover", async () => {
    const baseDir = config.codex.projectsBaseDir;
    const existingProjects = state.listProjects();
    const existingNames = new Set(
      existingProjects.map((project) => String(project.name || "").toLowerCase()),
    );
    const existingPaths = new Set(
      existingProjects.map((project) => path.resolve(String(project.path || "")).toLowerCase()),
    );
    return scanDiscoverableProjects(baseDir, existingNames, existingPaths);
  });

  app.post("/api/projects/import-all", async () => {
    const baseDir = config.codex.projectsBaseDir;
    const existingProjects = state.listProjects();
    const existingNames = new Set(
      existingProjects.map((project) => String(project.name || "").toLowerCase()),
    );
    const existingPaths = new Set(
      existingProjects.map((project) => path.resolve(String(project.path || "")).toLowerCase()),
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
    const requestedName = textValue(request.body?.projectName || "");
    const projectName = state.resolveProjectName(requestedName);
    if (!projectName) {
      reply.code(400);
      return {
        error: "valid projectName is required.",
      };
    }

    state.setProject(projectName);
    return {
      projectName,
      path: config.codex.projects.get(projectName),
    };
  });

  app.post("/api/projects", async (request, reply) => {
    const projectName = textValue(request.body?.projectName || request.body?.name || "");
    const requestedPath = textValue(request.body?.path || "");
    const setActive = parseBoolean(request.body?.setActive, true);

    if (!projectName && !requestedPath) {
      reply.code(400);
      return {
        error: "projectName is required.",
      };
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
      (project) => path.resolve(String(project.path || "")).toLowerCase() === resolvedPathLower,
    );
    if (existingByPath) {
      if (setActive) {
        state.setProject(existingByPath.name);
      }
      return {
        ok: true,
        alreadyExists: true,
        projectName: existingByPath.name,
        path: existingByPath.path,
        basePath: config.codex.projectsBaseDir,
        activeProject: state.getProject().name,
        projects: state.listProjects(),
      };
    }

    const safeName = sanitizeProjectName(projectName) || sanitizeProjectName(path.basename(resolvedPath));
    if (!safeName) {
      reply.code(400);
      return { error: "Invalid project name. Use letters, numbers, dots, underscores, or dashes." };
    }

    const existingNames = new Set(
      existingProjects.map((project) => String(project.name || "").toLowerCase()),
    );
    if (existingNames.has(safeName.toLowerCase())) {
      reply.code(400);
      return { error: `Project ${safeName} already exists.` };
    }

    const created = state.addProject({
      projectName: safeName,
      projectPath: resolvedPath,
    });
    if (created.error) {
      reply.code(400);
      return { error: created.error };
    }

    if (setActive) {
      state.setProject(created.project.name);
    }

    return {
      ok: true,
      projectName: created.project.name,
      path: created.project.path,
      basePath: config.codex.projectsBaseDir,
      activeProject: state.getProject().name,
      projects: state.listProjects(),
    };
  });

  app.delete("/api/projects/:name", async (request, reply) => {
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
      activeProject: state.getProject().name,
    };
  });

  app.get("/api/runtime-approvals", async (request) => {
    const status = textValue(request.query?.status || "");
    const jobId = textValue(request.query?.jobId || "");
    const limitInput = Number.parseInt(String(request.query?.limit || 50), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 500)) : 50;

    return {
      approvals: serializeRuntimeApprovals(state.listRuntimeApprovals({
        status,
        jobId,
        limit,
      })),
    };
  });

  app.post("/api/runtime-approvals/:id/approve", async (request, reply) => {
    const id = textValue(request.params?.id || "");
    const existing = state.getRuntimeApprovalById(id);
    if (!existing) {
      reply.code(404);
      return { error: "Runtime approval not found." };
    }

    const resolved = state.resolveRuntimeApproval({
      id,
      status: "approved",
    }) || state.getRuntimeApprovalById(id);
    state.resolveRuntimeApprovalDecision({
      id,
      decision: "approve",
    });

    eventBus.publish({
      jobId: existing.jobId,
      chatId: state.getOwnerId(),
      eventType: "runtime_approval_user_approved",
      message: "Runtime approval approved by user.",
      payload: {
        approvalId: id,
      },
    });

    return {
      ok: true,
      approval: serializeRuntimeApproval(resolved),
    };
  });

  app.post("/api/runtime-approvals/:id/deny", async (request, reply) => {
    const id = textValue(request.params?.id || "");
    const existing = state.getRuntimeApprovalById(id);
    if (!existing) {
      reply.code(404);
      return { error: "Runtime approval not found." };
    }

    const resolved = state.resolveRuntimeApproval({
      id,
      status: "denied",
    }) || state.getRuntimeApprovalById(id);
    state.resolveRuntimeApprovalDecision({
      id,
      decision: "deny",
    });

    eventBus.publish({
      jobId: existing.jobId,
      chatId: state.getOwnerId(),
      eventType: "runtime_approval_user_denied",
      message: "Runtime approval denied by user.",
      payload: {
        approvalId: id,
      },
    });

    return {
      ok: true,
      approval: serializeRuntimeApproval(resolved),
    };
  });

  registerJobRoutes({
    app,
    state,
    eventBus,
    jobRunner,
    repository,
    config,
  });

  registerEventRoute(app, eventBus);
}
