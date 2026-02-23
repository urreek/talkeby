import path from "node:path";

import { isSupportedProvider, supportedProviderText } from "./providers/catalog.mjs";

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
    `Invalid TELEGRAM_DEFAULT_EXECUTION_MODE "${value}". Use "auto" or "interactive".`,
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function parseIdList(value) {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(items);
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
        `Invalid CODEX_PROJECTS entry "${entry}". Expected format: name=/path/to/project`,
      );
    }

    const name = entry.slice(0, separatorIndex).trim();
    const projectPath = entry.slice(separatorIndex + 1).trim();
    if (!name || !projectPath) {
      throw new Error(
        `Invalid CODEX_PROJECTS entry "${entry}". Expected format: name=/path/to/project`,
      );
    }
    if (projects.has(name)) {
      throw new Error(`Duplicate CODEX_PROJECTS name "${name}".`);
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
    `CODEX_DEFAULT_PROJECT "${requested}" was not found in CODEX_PROJECTS.`,
  );
}

export function loadConfig() {
  const port = parseInteger(process.env.PORT, 3000);
  const codexTimeoutMs = parseInteger(process.env.CODEX_TIMEOUT_MS, 15 * 60 * 1000);
  const fallbackWorkdir = path.resolve(process.env.CODEX_WORKDIR?.trim() || process.cwd());
  const projectsBaseDir = path.resolve(
    process.env.CODEX_PROJECTS_BASE_DIR?.trim() || path.dirname(fallbackWorkdir),
  );
  const dataDir = path.resolve(
    process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data"),
  );
  const databaseFile = path.resolve(
    process.env.DATABASE_FILE?.trim() || path.join(dataDir, "talkeby.db"),
  );
  const projects = parseProjectMap(process.env.CODEX_PROJECTS, fallbackWorkdir);
  const defaultProjectName = resolveDefaultProjectName(
    projects,
    process.env.CODEX_DEFAULT_PROJECT,
  );

  const telegram = {
    botToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    allowedChatIds: parseIdList(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    allowUnverifiedChats: parseBoolean(process.env.ALLOW_UNVERIFIED_CHATS, false),
    defaultExecutionMode: parseExecutionMode(
      process.env.TELEGRAM_DEFAULT_EXECUTION_MODE,
      "auto",
    ),
    commandPin: process.env.COMMAND_PIN?.trim() || "",
    pollTimeoutSeconds: parseInteger(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS, 30),
    retryDelayMs: parseInteger(process.env.TELEGRAM_RETRY_DELAY_MS, 1500),
    dropPendingUpdates: parseBoolean(process.env.TELEGRAM_DROP_PENDING_UPDATES, true),
    progressUpdates: parseBoolean(process.env.TELEGRAM_PROGRESS_UPDATES, true),
    progressUpdateSeconds: Math.max(
      10,
      parseInteger(process.env.TELEGRAM_PROGRESS_UPDATE_SECONDS, 60),
    ),
    forceAutoMode: parseBoolean(process.env.FORCE_AUTO_MODE, true),
  };
  const ownerChatId = process.env.OWNER_CHAT_ID?.trim() || "";
  if (ownerChatId) {
    telegram.allowedChatIds.add(ownerChatId);
  }

  const provider = (process.env.AI_PROVIDER?.trim() || "codex").toLowerCase();
  if (!isSupportedProvider(provider)) {
    throw new Error(
      `Invalid AI_PROVIDER "${provider}". Supported: ${supportedProviderText()}`,
    );
  }

  const codex = {
    binary: process.env.CODEX_BINARY?.trim() || "codex",
    workdir: defaultProjectName ? projects.get(defaultProjectName) : fallbackWorkdir,
    projectsBaseDir,
    projects,
    defaultProjectName,
    timeoutMs: codexTimeoutMs,
    model: process.env.CODEX_MODEL?.trim() || "",
  };
  const threads = {
    defaultTokenBudget: Math.max(
      0,
      parseInteger(process.env.THREAD_DEFAULT_TOKEN_BUDGET, 12000),
    ),
    autoTrimContextDefault: parseBoolean(process.env.THREAD_AUTO_TRIM_CONTEXT_DEFAULT, true),
  };

  const runner = {
    provider,
    model:
      process.env.AI_MODEL?.trim() ||
      process.env.CODEX_MODEL?.trim() ||
      "",
    timeoutMs: codexTimeoutMs,
    binaries: {
      codex: process.env.CODEX_BINARY?.trim() || "codex",
      claude: process.env.CLAUDE_BINARY?.trim() || "claude",
      gemini: process.env.GEMINI_BINARY?.trim() || "gemini",
      groq: process.env.AIDER_BINARY?.trim() || "aider",
      openrouter: process.env.AIDER_BINARY?.trim() || "aider",
      aider: process.env.AIDER_BINARY?.trim() || "aider",
    },
    freeModelsOnly: parseBoolean(process.env.FREE_MODELS_ONLY, true),
  };

  const security = {
    rateLimitPerMinute: Math.max(
      30,
      parseInteger(process.env.API_RATE_LIMIT_PER_MINUTE, 240),
    ),
    ownerKey: process.env.APP_ACCESS_KEY?.trim() || "",
    ownerChatId,
    csrfSecret: process.env.CSRF_SECRET?.trim() || `${telegram.botToken}:${databaseFile}`,
    csrfTtlMs: Math.max(
      60,
      parseInteger(process.env.CSRF_TTL_SECONDS, 12 * 60 * 60),
    ) * 1000,
  };

  const runtimePolicy = {
    enabled: parseBoolean(process.env.RUNTIME_POLICY_ENABLED, true),
    autoApproveAll: parseBoolean(process.env.RUNTIME_POLICY_AUTO_APPROVE_ALL, true),
    fileChangeRequiresApproval: parseBoolean(
      process.env.RUNTIME_POLICY_FILE_CHANGES_REQUIRE_APPROVAL,
      false,
    ),
    telegramApprovalNotifications: parseBoolean(
      process.env.RUNTIME_APPROVAL_TELEGRAM_NOTIFICATIONS,
      false,
    ),
  };

  return {
    port,
    storage: {
      dataDir,
      databaseFile,
    },
    telegram,
    codex,
    threads,
    runner,
    security,
    runtimePolicy,
  };
}
