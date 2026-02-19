import path from "node:path";

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

  if (projects.size === 0) {
    projects.set("default", fallbackWorkdir);
  }

  return projects;
}

function resolveDefaultProjectName(projects, configuredDefault) {
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
  };

  const codex = {
    binary: process.env.CODEX_BINARY?.trim() || "codex",
    workdir: projects.get(defaultProjectName),
    projects,
    defaultProjectName,
    timeoutMs: codexTimeoutMs,
    model: process.env.CODEX_MODEL?.trim() || "",
  };

  return {
    port,
    storage: {
      dataDir,
      databaseFile,
    },
    telegram,
    codex,
  };
}
