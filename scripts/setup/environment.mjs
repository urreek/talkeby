import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

function placeholder(value) {
  return !value || /your-user|path\/to\/repo|choose-a-long-random-secret|replace-me/i.test(value);
}

function writeValues(source, updates) {
  const pending = new Map(updates);
  const lines = source.split(/\r?\n/).map((line) => {
    const match = /^\s*([A-Z_][A-Z_0-9]*)\s*=/.exec(line);
    if (!match || !updates.has(match[1])) return line;
    const value = updates.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${JSON.stringify(value)}`;
  });
  for (const [key, value] of pending) lines.push(`${key}=${JSON.stringify(value)}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

export function prepareEnvironment(rootDir) {
  const envPath = path.join(rootDir, ".env");
  const fresh = !fs.existsSync(envPath);
  const source = fs.readFileSync(fresh ? path.join(rootDir, ".env.example") : envPath, "utf8");
  const env = parseEnv(source);
  const updates = new Map();
  const defaults = {
    PORT: "3000", WEB_PORT: "5173", DATA_DIR: "./data",
    WORKSPACE_DIR: env.CODEX_WORKDIR || rootDir.replaceAll("\\", "/"),
    APP_ACCESS_KEY: crypto.randomBytes(32).toString("base64url"),
    AI_PROVIDER: "codex", CODEX_BINARY: "codex",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (placeholder(env[key])) updates.set(key, value);
  }
  const dataDir = updates.get("DATA_DIR") || env.DATA_DIR;
  if (placeholder(env.DATABASE_FILE)) updates.set("DATABASE_FILE", `${dataDir.replaceAll("\\", "/").replace(/\/$/, "")}/talkeby.db`);
  if (fresh) {
    updates.set("DEFAULT_EXECUTION_MODE", "interactive");
    updates.set("RUNTIME_POLICY_ENABLED", "false");
    if (!env.PROJECTS && !env.CODEX_PROJECTS) updates.set("PROJECTS", "talkeby=.");
  }
  const text = writeValues(source, updates);
  if (fresh || updates.size) fs.writeFileSync(envPath, text, { mode: 0o600 });
  const configured = parseEnv(text);
  const workdir = path.resolve(rootDir, configured.WORKSPACE_DIR);
  if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
    throw new Error("WORKSPACE_DIR is not an existing folder. Correct it in .env and rerun setup.");
  }
  fs.mkdirSync(path.resolve(rootDir, configured.DATA_DIR), { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(rootDir, configured.DATABASE_FILE)), { recursive: true });
  return { env: configured, envPath };
}
