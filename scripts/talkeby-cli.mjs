#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");

function parseEnv(text) {
  const map = new Map();
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map.set(key, value);
  }
  return map;
}

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return new Map();
  }
  return parseEnv(fs.readFileSync(ENV_PATH, "utf8"));
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }
  fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
}

function upsertEnvValues(filePath, entries) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  const pending = new Map(entries);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!pending.has(key)) {
      continue;
    }
    lines[i] = `${key}=${pending.get(key)}`;
    pending.delete(key);
  }

  for (const [key, value] of pending.entries()) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, `${lines.join("\n").replace(/\n+$/g, "")}\n`, "utf8");
}

function which(binary) {
  const candidate = String(binary || "").trim();
  if (!candidate) {
    return "";
  }

  if (path.isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\")) {
    return fs.existsSync(candidate) ? candidate : "";
  }

  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [candidate], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "";
  }
  const first = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first || "";
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function printHeader(title) {
  // eslint-disable-next-line no-console
  console.log(`\n== ${title} ==`);
}

function parseNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map((part) => Number.parseInt(part, 10));
  return { major: major || 0, minor: minor || 0 };
}

function nodeVersionOk() {
  const { major, minor } = parseNodeVersion();
  return major > 20 || (major === 20 && minor >= 19);
}

async function runInstall() {
  printHeader("Talkeby Guided Install");
  ensureEnvFile();
  const env = readEnvFile();

  const rl = readline.createInterface({ input, output });
  const ask = async (label, fallback = "") => {
    const suffix = fallback ? ` [${fallback}]` : "";
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    return answer || fallback;
  };

  const defaultWorkdir = env.get("CODEX_WORKDIR") || ROOT_DIR;
  const defaultProjectsBase = env.get("CODEX_PROJECTS_BASE_DIR") || path.dirname(defaultWorkdir);
  const defaultPort = env.get("PORT") || "3000";
  const codexBinary = which("codex") || env.get("CODEX_BINARY") || "codex";

  const token = await ask("TELEGRAM_BOT_TOKEN", env.get("TELEGRAM_BOT_TOKEN") || "");
  const allowedChats = await ask("TELEGRAM_ALLOWED_CHAT_IDS", env.get("TELEGRAM_ALLOWED_CHAT_IDS") || "");
  const workdir = await ask("CODEX_WORKDIR", defaultWorkdir);
  const projectsBaseDir = await ask("CODEX_PROJECTS_BASE_DIR", defaultProjectsBase);
  const port = await ask("PORT", defaultPort);

  const installDepsAnswer = (await ask("Install npm dependencies now? (yes/no)", "yes")).toLowerCase();
  const installLaunchdAnswer = (await ask("Install launchd service now? (yes/no)", "no")).toLowerCase();

  rl.close();

  upsertEnvValues(ENV_PATH, [
    ["PORT", port],
    ["TELEGRAM_BOT_TOKEN", token],
    ["TELEGRAM_ALLOWED_CHAT_IDS", allowedChats],
    ["ALLOW_UNVERIFIED_CHATS", "false"],
    ["CODEX_BINARY", codexBinary],
    ["CODEX_WORKDIR", path.resolve(workdir)],
    ["CODEX_PROJECTS_BASE_DIR", path.resolve(projectsBaseDir)],
  ]);

  // eslint-disable-next-line no-console
  console.log(`Updated ${ENV_PATH}`);

  if (installDepsAnswer.startsWith("y")) {
    printHeader("Installing Dependencies");
    if (!runCommand("npm", ["install"])) {
      process.exitCode = 1;
      return;
    }
  }

  if (installLaunchdAnswer.startsWith("y")) {
    printHeader("Installing Launchd Service");
    if (!runCommand("npm", ["run", "launchd:install"])) {
      process.exitCode = 1;
      return;
    }
  }

  printHeader("Install Complete");
  // eslint-disable-next-line no-console
  console.log("Next: npm start");
}

function isPlaceholderPath(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized.includes("your-user") || normalized.includes("path/to/repo");
}

async function runBootstrap() {
  printHeader("Talkeby Bootstrap");

  if (!nodeVersionOk()) {
    // eslint-disable-next-line no-console
    console.error(`Node ${process.versions.node} detected; require >=20.19.`);
    process.exitCode = 1;
    return;
  }

  ensureEnvFile();
  const env = readEnvFile();
  const updates = [];

  const port = String(env.get("PORT") || "").trim();
  if (!port) {
    updates.push(["PORT", "3000"]);
  }

  const workdir = String(env.get("CODEX_WORKDIR") || "").trim();
  if (!workdir || isPlaceholderPath(workdir)) {
    updates.push(["CODEX_WORKDIR", ROOT_DIR]);
  }

  const projectsBaseDir = String(env.get("CODEX_PROJECTS_BASE_DIR") || "").trim();
  if (!projectsBaseDir || isPlaceholderPath(projectsBaseDir)) {
    updates.push(["CODEX_PROJECTS_BASE_DIR", path.dirname(ROOT_DIR)]);
  }

  const currentBinary = String(env.get("CODEX_BINARY") || "").trim();
  const resolvedBinary = which("codex");
  if (resolvedBinary && (!currentBinary || currentBinary === "codex" || isPlaceholderPath(currentBinary))) {
    updates.push(["CODEX_BINARY", resolvedBinary]);
  }

  if (updates.length > 0) {
    upsertEnvValues(ENV_PATH, updates);
  }

  printHeader("Installing Dependencies");
  if (!runCommand("npm", ["install"])) {
    process.exitCode = 1;
    return;
  }

  printHeader("Bootstrap Complete");
  // eslint-disable-next-line no-console
  console.log(`Environment file: ${ENV_PATH}`);
  // eslint-disable-next-line no-console
  console.log("Next steps:");
  // eslint-disable-next-line no-console
  console.log("1) Run `npm run setup` to fill Telegram token/chat if not set.");
  // eslint-disable-next-line no-console
  console.log("2) Run `npm start` for backend worker.");
  // eslint-disable-next-line no-console
  console.log("3) Run `npm run web:dev` in another terminal for mobile UI.");
}

function isLikelyTelegramToken(value) {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(value || "").trim());
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function addUnique(list, value) {
  const safe = String(value || "").trim();
  if (!safe) {
    return;
  }
  if (!list.includes(safe)) {
    list.push(safe);
  }
}

function commandForPlatform(commands) {
  if (!commands || typeof commands !== "object") {
    return "";
  }
  if (commands[process.platform]) {
    return String(commands[process.platform]);
  }
  return String(commands.default || "");
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureWritableDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function launchdStatus(label) {
  if (process.platform !== "darwin") {
    return {
      supported: false,
      installed: false,
      running: false,
      plistPath: "",
    };
  }

  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
  const installed = fs.existsSync(plistPath);
  if (!installed) {
    return {
      supported: true,
      installed: false,
      running: false,
      plistPath,
    };
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : "";
  const target = uid ? `gui/${uid}/${label}` : label;
  const result = spawnSync("launchctl", ["print", target], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const running = result.status === 0 && /(state\s*=\s*running|pid\s*=)/i.test(output);

  return {
    supported: true,
    installed: true,
    running,
    plistPath,
  };
}

async function checkTelegramToken(token) {
  if (!token) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: "GET",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    return Boolean(body?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runDoctor() {
  printHeader("Talkeby Doctor v2");
  const failures = [];
  const warnings = [];
  const infos = [];
  const suggestions = [];

  const addFailure = (message, fix = "") => {
    addUnique(failures, message);
    addUnique(suggestions, fix);
  };
  const addWarning = (message, fix = "") => {
    addUnique(warnings, message);
    addUnique(suggestions, fix);
  };
  const addInfo = (message) => {
    addUnique(infos, message);
  };

  const envExists = fs.existsSync(ENV_PATH);
  if (!envExists) {
    addFailure(`Missing ${ENV_PATH}.`, "npm run setup:guided");
  }
  const env = envExists ? readEnvFile() : new Map();

  if (!nodeVersionOk()) {
    addFailure(
      `Node ${process.versions.node} detected; require >=20.19.`,
      commandForPlatform({
        darwin: "brew install node@22",
        linux: "nvm install 22 && nvm use 22",
        win32: "winget install OpenJS.NodeJS.LTS",
        default: "Install Node.js 22 LTS and retry.",
      }),
    );
  }

  const token = String(env.get("TELEGRAM_BOT_TOKEN") || "").trim();
  const allowedChats = String(env.get("TELEGRAM_ALLOWED_CHAT_IDS") || "").trim();
  const workdir = String(env.get("CODEX_WORKDIR") || "").trim();
  const projectsBaseDir = String(env.get("CODEX_PROJECTS_BASE_DIR") || path.dirname(ROOT_DIR)).trim();
  const selectedProvider = String(env.get("AI_PROVIDER") || "codex").trim().toLowerCase();
  const binaries = {
    codex: String(env.get("CODEX_BINARY") || "codex").trim(),
    claude: String(env.get("CLAUDE_BINARY") || "claude").trim(),
    gemini: String(env.get("GEMINI_BINARY") || "gemini").trim(),
    groq: String(env.get("AIDER_BINARY") || "aider").trim(),
    openrouter: String(env.get("AIDER_BINARY") || "aider").trim(),
  };
  const dataDir = String(env.get("DATA_DIR") || path.join(ROOT_DIR, "data")).trim();
  const databaseFile = String(env.get("DATABASE_FILE") || "").trim() || path.join(dataDir, "talkeby.db");
  const appAccessKey = String(env.get("APP_ACCESS_KEY") || "").trim();
  const ownerChatId = String(env.get("OWNER_CHAT_ID") || "").trim();
  const port = parseInteger(env.get("PORT") || "3000", 3000);
  const webPort = parseInteger(env.get("WEB_PORT") || "5173", 5173);

  if (!token) {
    addWarning(
      "TELEGRAM_BOT_TOKEN is missing. Telegram control is disabled.",
      "Set TELEGRAM_BOT_TOKEN in .env and rerun doctor.",
    );
  } else if (!isLikelyTelegramToken(token)) {
    addFailure(
      "TELEGRAM_BOT_TOKEN has invalid format.",
      "Update TELEGRAM_BOT_TOKEN in .env with a valid BotFather token.",
    );
  }
  if (!allowedChats) {
    addWarning(
      "TELEGRAM_ALLOWED_CHAT_IDS is missing.",
      "Set TELEGRAM_ALLOWED_CHAT_IDS=<your_chat_id> in .env.",
    );
  }

  const providerRequirements = [
    { id: "codex", binary: binaries.codex, binaryEnv: "CODEX_BINARY", apiEnv: "", builtInAuth: true },
    { id: "claude", binary: binaries.claude, binaryEnv: "CLAUDE_BINARY", apiEnv: "ANTHROPIC_API_KEY", builtInAuth: false },
    { id: "gemini", binary: binaries.gemini, binaryEnv: "GEMINI_BINARY", apiEnv: "GOOGLE_API_KEY", builtInAuth: false },
    { id: "groq", binary: binaries.groq, binaryEnv: "AIDER_BINARY", apiEnv: "GROQ_API_KEY", builtInAuth: false },
    { id: "openrouter", binary: binaries.openrouter, binaryEnv: "AIDER_BINARY", apiEnv: "OPENROUTER_API_KEY", builtInAuth: false },
  ];

  for (const requirement of providerRequirements) {
    const isSelected = selectedProvider === requirement.id;
    const binarySetting = requirement.binary || requirement.id;
    const binaryResolved = (
      binarySetting.includes("/")
      || binarySetting.includes("\\")
      || path.isAbsolute(binarySetting)
    )
      ? (fs.existsSync(binarySetting) ? binarySetting : "")
      : which(binarySetting);

    if (!binaryResolved) {
      const message = `${requirement.id}: CLI binary not found (${binarySetting}).`;
      const fix = `Set ${requirement.binaryEnv} to a valid executable path in .env.`;
      if (isSelected) {
        addFailure(message, fix);
      } else {
        addWarning(message, fix);
      }
      continue;
    }

    if (!requirement.builtInAuth && requirement.apiEnv && !String(env.get(requirement.apiEnv) || "").trim()) {
      const message = `${requirement.id}: missing ${requirement.apiEnv}.`;
      const fix = `Set ${requirement.apiEnv}=<key> in .env for ${requirement.id}.`;
      if (isSelected) {
        addFailure(message, fix);
      } else {
        addWarning(message, fix);
      }
    }
  }

  if (!workdir) {
    addFailure("CODEX_WORKDIR is missing.", "Set CODEX_WORKDIR=/absolute/path/to/project in .env.");
  } else if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
    addFailure(
      `CODEX_WORKDIR does not exist or is not a directory: ${workdir}`,
      "Update CODEX_WORKDIR in .env to an existing project folder.",
    );
  }

  if (!projectsBaseDir || !fs.existsSync(projectsBaseDir) || !fs.statSync(projectsBaseDir).isDirectory()) {
    addWarning(
      `CODEX_PROJECTS_BASE_DIR does not exist or is not a directory: ${projectsBaseDir}`,
      "Set CODEX_PROJECTS_BASE_DIR to an existing folder containing your projects.",
    );
  }

  if (!ensureWritableDirectory(path.dirname(databaseFile))) {
    addFailure(
      `Database directory is not writable: ${path.dirname(databaseFile)}`,
      commandForPlatform({
        win32: `mkdir "${path.dirname(databaseFile)}"`,
        default: `mkdir -p "${path.dirname(databaseFile)}"`,
      }),
    );
  }
  if (!ensureWritableDirectory(dataDir)) {
    addFailure(
      `DATA_DIR is not writable: ${dataDir}`,
      commandForPlatform({
        win32: `mkdir "${dataDir}"`,
        default: `mkdir -p "${dataDir}"`,
      }),
    );
  }

  if (Number.isFinite(port) && port > 0) {
    const available = await checkPortAvailable(port);
    if (!available) {
      addWarning(
        `PORT ${port} is already in use.`,
        commandForPlatform({
          win32: `netstat -ano | findstr :${port}`,
          default: `lsof -i :${port}`,
        }),
      );
    }
  } else {
    addFailure("PORT is invalid.", "Set PORT to a valid integer in .env (example: PORT=3000).");
  }

  if (Number.isFinite(webPort) && webPort > 0) {
    const webAvailable = await checkPortAvailable(webPort);
    if (!webAvailable) {
      addWarning(
        `WEB_PORT ${webPort} is already in use.`,
        commandForPlatform({
          win32: `netstat -ano | findstr :${webPort}`,
          default: `lsof -i :${webPort}`,
        }),
      );
    }
  } else {
    addFailure("WEB_PORT is invalid.", "Set WEB_PORT to a valid integer in .env (example: WEB_PORT=5173).");
  }

  if (!fs.existsSync(path.join(ROOT_DIR, "node_modules"))) {
    addFailure("Root dependencies missing.", "npm install");
  }
  if (!fs.existsSync(path.join(ROOT_DIR, "web", "node_modules"))) {
    addFailure("Web dependencies missing.", "npm run web:install");
  }

  if (token && isLikelyTelegramToken(token)) {
    const telegramOk = await checkTelegramToken(token);
    if (!telegramOk) {
      addWarning(
        "Telegram token validation failed (token invalid or no internet access).",
        "Verify TELEGRAM_BOT_TOKEN and retry when internet is available.",
      );
    }
  }

  if (!appAccessKey) {
    addWarning(
      "APP_ACCESS_KEY is missing. Public web exposure is not protected.",
      "Set APP_ACCESS_KEY=<long-random-secret> in .env.",
    );
  }
  if (!ownerChatId) {
    addInfo("OWNER_CHAT_ID not set. Web clients must provide chatId explicitly.");
  }

  const cloudflaredBinary = which("cloudflared");
  const cloudflareToken = String(env.get("CLOUDFLARE_TUNNEL_TOKEN") || process.env.CLOUDFLARE_TUNNEL_TOKEN || "").trim();
  if (!cloudflaredBinary) {
    addWarning(
      "cloudflared binary not found (internet tunnel helper unavailable).",
      commandForPlatform({
        darwin: "brew install cloudflared",
        linux: "Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
        win32: "winget install Cloudflare.cloudflared",
        default: "Install cloudflared and rerun doctor.",
      }),
    );
  } else if (!cloudflareToken) {
    addInfo("CLOUDFLARE_TUNNEL_TOKEN not set. Tunnel helper will use temporary trycloudflare URL.");
  }

  const workerService = launchdStatus("com.talkeby.worker");
  const webService = launchdStatus("com.talkeby.web");
  if (workerService.supported) {
    if (!workerService.installed) {
      addWarning("launchd worker service is not installed.", "npm run launchd:install");
    } else if (!workerService.running) {
      addWarning("launchd worker service is installed but not running.", "launchctl kickstart -k gui/$(id -u)/com.talkeby.worker");
    }
    if (!webService.installed) {
      addWarning("launchd web service is not installed.", "npm run launchd:web:install");
    } else if (!webService.running) {
      addWarning("launchd web service is installed but not running.", "launchctl kickstart -k gui/$(id -u)/com.talkeby.web");
    }
  } else {
    addInfo("Background service checks are currently available only on macOS launchd.");
  }

  // eslint-disable-next-line no-console
  console.log(`Node version: ${process.versions.node}`);
  // eslint-disable-next-line no-console
  console.log(`Platform: ${process.platform} ${os.release()}`);
  // eslint-disable-next-line no-console
  console.log(`Env file: ${envExists ? "OK" : "MISSING"}`);
  // eslint-disable-next-line no-console
  console.log(`Provider: ${selectedProvider}`);
  // eslint-disable-next-line no-console
  console.log(`Database: ${databaseFile}`);
  // eslint-disable-next-line no-console
  console.log(`Ports: backend=${port} web=${webPort}`);

  if (warnings.length > 0) {
    printHeader("Warnings");
    for (const warning of warnings) {
      // eslint-disable-next-line no-console
      console.log(`- ${warning}`);
    }
  }

  if (infos.length > 0) {
    printHeader("Info");
    for (const info of infos) {
      // eslint-disable-next-line no-console
      console.log(`- ${info}`);
    }
  }

  if (suggestions.length > 0) {
    printHeader("Suggested Fixes");
    for (const suggestion of suggestions) {
      // eslint-disable-next-line no-console
      console.log(`- ${suggestion}`);
    }
  }

  if (failures.length > 0) {
    printHeader("Failures");
    for (const failure of failures) {
      // eslint-disable-next-line no-console
      console.log(`- ${failure}`);
    }
    printHeader("Doctor Failed");
    // eslint-disable-next-line no-console
    console.log(`Failures: ${failures.length}, Warnings: ${warnings.length}`);
    process.exitCode = 1;
    return;
  }

  printHeader("Doctor Passed");
  // eslint-disable-next-line no-console
  console.log(`Environment looks healthy. Warnings: ${warnings.length}`);
}

async function main() {
  const command = String(process.argv[2] || "").trim().toLowerCase();

  if (!command || command === "help" || command === "--help" || command === "-h") {
    // eslint-disable-next-line no-console
    console.log("Usage: node scripts/talkeby-cli.mjs <install|bootstrap|doctor>");
    return;
  }

  if (command === "install" || command === "setup") {
    await runInstall();
    return;
  }
  if (command === "bootstrap") {
    await runBootstrap();
    return;
  }
  if (command === "doctor") {
    await runDoctor();
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.message || error);
  process.exitCode = 1;
});
