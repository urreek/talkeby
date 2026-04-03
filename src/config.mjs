import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getProviderMeta, isSupportedProvider, supportedProviderText } from "./providers/catalog.mjs";
import { parseSandboxMode } from "./services/sandbox-policy.mjs";

function parseBoolean(value, fallback) {
  if (value === undefined) {
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

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseExecutionMode(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "auto" || normalized === "interactive") {
    return normalized;
  }
  throw new Error(
    `Invalid DEFAULT_EXECUTION_MODE "${value}". Use "auto" or "interactive".`,
  );
}

function parseProjectMap(value, fallbackWorkdir) {
  const entries = String(value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const projects = new Map();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(
        `Invalid PROJECTS entry "${entry}". Expected format: name=/path/to/project`,
      );
    }

    const name = entry.slice(0, separatorIndex).trim();
    const projectPath = entry.slice(separatorIndex + 1).trim();
    if (!name || !projectPath) {
      throw new Error(
        `Invalid PROJECTS entry "${entry}". Expected format: name=/path/to/project`,
      );
    }
    if (projects.has(name)) {
      throw new Error(`Duplicate PROJECTS name "${name}".`);
    }
    projects.set(name, path.resolve(projectPath));
  }

  return projects;
}

function resolveDefaultProjectName(projects, configuredDefault) {
  if (projects.size === 0) {
    return "";
  }

  const requested = String(configuredDefault ?? "").trim();
  if (!requested) {
    return projects.keys().next().value;
  }

  for (const name of projects.keys()) {
    if (name.toLowerCase() === requested.toLowerCase()) {
      return name;
    }
  }

  throw new Error(
    `DEFAULT_PROJECT "${requested}" was not found in PROJECTS.`,
  );
}

function normalizeExistingDirectory(value, fallbackDir) {
  const fallback = path.resolve(String(fallbackDir || process.cwd()));
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) ? resolved : fallback;
}

function findBinaryOnPath(command) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "";
  }

  const firstMatch = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstMatch || "";
}

function binaryCandidates(command) {
  const base = String(command || "").trim();
  if (!base) {
    return [];
  }

  if (process.platform !== "win32") {
    return [base];
  }

  const values = [base];
  const lower = base.toLowerCase();
  if (!lower.endsWith(".cmd")) values.push(`${base}.cmd`);
  if (!lower.endsWith(".exe")) values.push(`${base}.exe`);
  if (!lower.endsWith(".bat")) values.push(`${base}.bat`);
  return Array.from(new Set(values));
}

function appendWindowsExecutableCandidates(filePath) {
  const normalized = String(filePath || "").trim();
  if (!normalized || process.platform !== "win32") {
    return [];
  }

  const extension = path.extname(normalized).toLowerCase();
  if (extension === ".cmd" || extension === ".exe" || extension === ".bat" || extension === ".ps1") {
    return [normalized];
  }

  return [
    `${normalized}.cmd`,
    `${normalized}.exe`,
    `${normalized}.bat`,
    `${normalized}.ps1`,
    normalized,
  ];
}

function resolveExistingBinaryPath(value) {
  const candidates = appendWindowsExecutableCandidates(value);
  if (candidates.length === 0) {
    return fs.existsSync(value) ? value : "";
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function normalizeBinarySetting(value, fallbackCommand) {
  const raw = String(value || "").trim();
  const configured = raw || fallbackCommand;
  const looksLikePath = path.isAbsolute(configured)
    || configured.includes("/")
    || configured.includes("\\");

  if (looksLikePath) {
    const existingPath = resolveExistingBinaryPath(configured);
    if (existingPath) {
      return existingPath;
    }
  }

  // If a copied config contains a foreign absolute path, reduce to basename first.
  const commandBase = looksLikePath
    ? path.basename(configured).replace(/\.(cmd|exe|bat)$/i, "")
    : configured;

  for (const candidate of binaryCandidates(commandBase)) {
    const resolved = findBinaryOnPath(candidate);
    if (resolved) {
      return resolved;
    }
  }

  // No path hit; keep a command name fallback so spawn can still try PATH.
  const fallbackCandidates = binaryCandidates(fallbackCommand);
  return fallbackCandidates[0] || fallbackCommand;
}

export function loadConfig() {
  const port = parseInteger(process.env.PORT, 3000);
  const codexTimeoutMs = parseInteger(process.env.CODEX_TIMEOUT_MS, 15 * 60 * 1000);
  const configuredWorkspaceDir = process.env.WORKSPACE_DIR?.trim()
    || process.env.CODEX_WORKDIR?.trim();
  const fallbackWorkdir = normalizeExistingDirectory(
    configuredWorkspaceDir,
    process.cwd(),
  );
  const projectsBaseDir = fallbackWorkdir;
  const dataDir = path.resolve(
    process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data"),
  );
  const databaseFile = path.resolve(
    process.env.DATABASE_FILE?.trim() || path.join(dataDir, "talkeby.db"),
  );
  const projects = parseProjectMap(
    process.env.PROJECTS || process.env.CODEX_PROJECTS,
    fallbackWorkdir,
  );
  const defaultProjectName = resolveDefaultProjectName(
    projects,
    process.env.DEFAULT_PROJECT?.trim() || process.env.CODEX_DEFAULT_PROJECT?.trim(),
  );
  const app = {
    defaultExecutionMode: parseExecutionMode(
      process.env.DEFAULT_EXECUTION_MODE,
      "auto",
    ),
    progressUpdates: parseBoolean(
      process.env.PROGRESS_UPDATES,
      true,
    ),
    progressUpdateSeconds: Math.max(
      10,
      parseInteger(
        process.env.PROGRESS_UPDATE_SECONDS,
        60,
      ),
    ),
  };

  const provider = (process.env.AI_PROVIDER?.trim() || "codex").toLowerCase();
  if (!isSupportedProvider(provider)) {
    throw new Error(
      `Invalid AI_PROVIDER "${provider}". Supported: ${supportedProviderText()}`,
    );
  }
  const providerMeta = getProviderMeta(provider);
  const defaultCodexModel = getProviderMeta("codex")?.defaultModel || "";
  const codexParityMode = parseBoolean(process.env.CODEX_PARITY_MODE, true);

  const workspace = {
    workdir: defaultProjectName ? projects.get(defaultProjectName) : fallbackWorkdir,
    projectsBaseDir,
    projects,
    defaultProjectName,
  };

  const codex = {
    binary: normalizeBinarySetting(process.env.CODEX_BINARY, "codex"),
    workdir: workspace.workdir,
    projectsBaseDir: workspace.projectsBaseDir,
    projects: workspace.projects,
    defaultProjectName: workspace.defaultProjectName,
    timeoutMs: codexTimeoutMs,
    model: process.env.CODEX_MODEL?.trim() || defaultCodexModel,
    parityMode: codexParityMode,
    persistExtendedHistory: parseBoolean(
      process.env.CODEX_PERSIST_EXTENDED_HISTORY,
      codexParityMode,
    ),
    sandboxMode: parseSandboxMode(
      process.env.CODEX_SANDBOX_MODE,
      "workspace-write",
    ),
    disableSessionResume: parseBoolean(
      process.env.CODEX_DISABLE_SESSION_RESUME,
      !codexParityMode,
    ),
  };
  const threads = {
    defaultTokenBudget: Math.max(
      0,
      parseInteger(process.env.THREAD_DEFAULT_TOKEN_BUDGET, 10000),
    ),
    autoTrimContextDefault: parseBoolean(process.env.THREAD_AUTO_TRIM_CONTEXT_DEFAULT, true),
  };

  const runner = {
    provider,
    model:
      process.env.AI_MODEL?.trim() ||
      process.env.CODEX_MODEL?.trim() ||
      providerMeta?.defaultModel ||
      "",
    timeoutMs: codexTimeoutMs,
    binaries: {
      codex: normalizeBinarySetting(process.env.CODEX_BINARY, "codex"),
      claude: normalizeBinarySetting(process.env.CLAUDE_BINARY, "claude"),
      gemini: normalizeBinarySetting(process.env.GEMINI_BINARY, "gemini"),
      copilot: normalizeBinarySetting(process.env.COPILOT_BINARY, "copilot"),
      groq: normalizeBinarySetting(process.env.AIDER_BINARY, "aider"),
      openrouter: normalizeBinarySetting(process.env.AIDER_BINARY, "aider"),
      aider: normalizeBinarySetting(process.env.AIDER_BINARY, "aider"),
    },
    freeModelsOnly: parseBoolean(process.env.FREE_MODELS_ONLY, true),
  };

  const providers = {
    discoverModels: parseBoolean(process.env.PROVIDER_MODEL_DISCOVERY, true),
  };

  const security = {
    rateLimitPerMinute: Math.max(
      30,
      parseInteger(process.env.API_RATE_LIMIT_PER_MINUTE, 240),
    ),
    ownerKey: process.env.APP_ACCESS_KEY?.trim() || "",
    sessionCookieName: "talkeby_session",
    csrfSecret: process.env.CSRF_SECRET?.trim() || `${process.env.APP_ACCESS_KEY?.trim() || "talkeby"}:${databaseFile}`,
    csrfTtlMs: Math.max(
      60,
      parseInteger(process.env.CSRF_TTL_SECONDS, 12 * 60 * 60),
    ) * 1000,
    sessionTtlMs: Math.max(
      300,
      parseInteger(process.env.SESSION_TTL_SECONDS, 30 * 24 * 60 * 60),
    ) * 1000,
  };

  const runtimePolicy = {
    enabled: parseBoolean(process.env.RUNTIME_POLICY_ENABLED, true),
    autoApproveAll: parseBoolean(process.env.RUNTIME_POLICY_AUTO_APPROVE_ALL, true),
    fileChangeRequiresApproval: parseBoolean(
      process.env.RUNTIME_POLICY_FILE_CHANGES_REQUIRE_APPROVAL,
      false,
    ),
  };
  const debug = {
    logPromptPayload: parseBoolean(process.env.DEBUG_LOG_PROMPT_PAYLOAD, false),
    logTokenUsage: parseBoolean(process.env.DEBUG_LOG_TOKEN_USAGE, false),
  };

  return {
    port,
    storage: {
      dataDir,
      databaseFile,
    },
    app,
    workspace,
    codex,
    threads,
    runner,
    providers,
    security,
    runtimePolicy,
    debug,
  };
}
