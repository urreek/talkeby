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
  printHeader("Talkeby Doctor");
  const failures = [];
  const warnings = [];

  const envExists = fs.existsSync(ENV_PATH);
  if (!envExists) {
    failures.push(`Missing ${ENV_PATH} (run: npm run setup:guided)`);
  }
  const env = envExists ? readEnvFile() : new Map();

  if (!nodeVersionOk()) {
    failures.push(`Node ${process.versions.node} detected; require >=20.19.`);
  }

  const token = env.get("TELEGRAM_BOT_TOKEN") || "";
  const allowedChats = env.get("TELEGRAM_ALLOWED_CHAT_IDS") || "";
  const workdir = env.get("CODEX_WORKDIR") || "";
  const binary = env.get("CODEX_BINARY") || "codex";
  const databaseFile = env.get("DATABASE_FILE") || "";
  const port = Number.parseInt(env.get("PORT") || "3000", 10);

  if (!isLikelyTelegramToken(token)) {
    failures.push("TELEGRAM_BOT_TOKEN is missing or invalid format.");
  }
  if (!allowedChats.trim()) {
    failures.push("TELEGRAM_ALLOWED_CHAT_IDS is missing.");
  }

  if (!workdir) {
    failures.push("CODEX_WORKDIR is missing.");
  } else if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
    failures.push(`CODEX_WORKDIR does not exist or is not a directory: ${workdir}`);
  }

  const resolvedBinary = (
    binary.includes("/")
    || binary.includes("\\")
    || path.isAbsolute(binary)
  )
    ? binary
    : which(binary);
  if (!resolvedBinary) {
    failures.push(`Codex binary not found: ${binary}`);
  }

  if (databaseFile) {
    const parent = path.dirname(databaseFile);
    try {
      fs.mkdirSync(parent, { recursive: true });
      fs.accessSync(parent, fs.constants.W_OK);
    } catch {
      failures.push(`Database directory is not writable: ${parent}`);
    }
  } else {
    warnings.push("DATABASE_FILE not set; default location will be used.");
  }

  if (Number.isFinite(port) && port > 0) {
    const available = await checkPortAvailable(port);
    if (!available) {
      failures.push(`PORT ${port} is already in use.`);
    }
  } else {
    failures.push("PORT is invalid.");
  }

  if (!fs.existsSync(path.join(ROOT_DIR, "node_modules"))) {
    failures.push("Root dependencies missing (run: npm install)");
  }
  if (!fs.existsSync(path.join(ROOT_DIR, "web", "node_modules"))) {
    failures.push("Web dependencies missing (run: npm run web:install)");
  }

  if (token && isLikelyTelegramToken(token)) {
    const telegramOk = await checkTelegramToken(token);
    if (!telegramOk) {
      failures.push("Telegram token validation failed (check TELEGRAM_BOT_TOKEN and internet access).");
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Node version: ${process.versions.node}`);
  // eslint-disable-next-line no-console
  console.log(`Env file: ${envExists ? "OK" : "MISSING"}`);
  // eslint-disable-next-line no-console
  console.log(`Codex binary: ${resolvedBinary || "NOT FOUND"}`);

  if (warnings.length > 0) {
    printHeader("Warnings");
    for (const warning of warnings) {
      // eslint-disable-next-line no-console
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    printHeader("Failures");
    for (const failure of failures) {
      // eslint-disable-next-line no-console
      console.log(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  printHeader("Doctor Passed");
  // eslint-disable-next-line no-console
  console.log("Environment looks healthy.");
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
