import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

function textValue(value) {
  return String(value || "").trim();
}

function getCodexHomeDir(codexHomeDir = "") {
  const explicit = textValue(codexHomeDir);
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(os.homedir(), ".codex");
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toSessionIndexTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return new Date().toISOString();
  }

  if (/^\d+$/.test(raw)) {
    const seconds = Number.parseInt(raw, 10);
    return new Date(seconds * 1000).toISOString();
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function toUnixSeconds(value, fallbackMs = Date.now()) {
  const raw = String(value || "").trim();
  if (!raw) {
    return Math.floor(fallbackMs / 1000);
  }

  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return Math.floor(fallbackMs / 1000);
  }
  return Math.floor(parsed / 1000);
}

export function normalizeCodexAppWorkdir(workdir) {
  const resolved = path.resolve(String(workdir || "").trim() || process.cwd());
  if (process.platform !== "win32") {
    return resolved;
  }
  if (resolved.startsWith("\\\\?\\")) {
    return resolved;
  }
  return `\\\\?\\${resolved}`;
}

export function denormalizeCodexAppWorkdir(workdir) {
  const raw = String(workdir || "").trim();
  if (!raw) {
    return "";
  }
  return process.platform === "win32"
    ? raw.replace(/^\\\\\?\\/, "")
    : raw;
}

export function getCodexSessionIndexPath({ codexHomeDir = "" } = {}) {
  return path.join(getCodexHomeDir(codexHomeDir), "session_index.jsonl");
}

export function findCodexStateDatabasePath({ codexHomeDir = "" } = {}) {
  const homeDir = getCodexHomeDir(codexHomeDir);
  let entries = [];
  try {
    entries = fs.readdirSync(homeDir, { withFileTypes: true });
  } catch {
    return "";
  }

  const matches = entries
    .filter((entry) => entry.isFile() && /^state_(\d+)\.sqlite$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(homeDir, entry.name);
      const versionMatch = entry.name.match(/^state_(\d+)\.sqlite$/i);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        stat = null;
      }
      return {
        fullPath,
        version: Number.parseInt(versionMatch?.[1] || "0", 10) || 0,
        mtimeMs: stat?.mtimeMs || 0,
      };
    })
    .sort((left, right) => (
      right.version - left.version
      || right.mtimeMs - left.mtimeMs
      || left.fullPath.localeCompare(right.fullPath)
    ));

  return matches[0]?.fullPath || "";
}

function openCodexStateDatabase({ codexHomeDir = "", readonly = true } = {}) {
  const databasePath = findCodexStateDatabasePath({ codexHomeDir });
  if (!databasePath) {
    return null;
  }
  return new Database(databasePath, { readonly });
}

export function bootstrapCodexAppRegistry(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT,
      cli_version TEXT NOT NULL DEFAULT '',
      first_user_message TEXT NOT NULL DEFAULT '',
      agent_nickname TEXT,
      agent_role TEXT,
      memory_mode TEXT NOT NULL DEFAULT 'enabled'
    );
  `);
}

export function listCodexAppThreads({
  codexHomeDir = "",
  includeArchived = false,
  limit = 5000,
} = {}) {
  const db = openCodexStateDatabase({ codexHomeDir, readonly: true });
  if (!db) {
    return [];
  }

  try {
    const safeLimit = Math.max(1, Number(limit) || 5000);
    const rows = includeArchived
      ? db.prepare("SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?").all(safeLimit)
      : db.prepare("SELECT * FROM threads WHERE archived = 0 ORDER BY updated_at DESC LIMIT ?").all(safeLimit);
    return rows;
  } finally {
    db.close();
  }
}

export function getCodexAppThreadById({ codexHomeDir = "", sessionId = "" } = {}) {
  const safeSessionId = textValue(sessionId);
  if (!safeSessionId) {
    return null;
  }

  const db = openCodexStateDatabase({ codexHomeDir, readonly: true });
  if (!db) {
    return null;
  }

  try {
    return db.prepare("SELECT * FROM threads WHERE id = ? LIMIT 1").get(safeSessionId) || null;
  } finally {
    db.close();
  }
}

export function findLatestCodexAppThreadTemplate({ codexHomeDir = "", workdir = "" } = {}) {
  const normalizedWorkdir = denormalizeCodexAppWorkdir(workdir).toLowerCase();
  if (!normalizedWorkdir) {
    return null;
  }

  const threads = listCodexAppThreads({
    codexHomeDir,
    includeArchived: true,
    limit: 5000,
  });
  return threads.find((thread) => (
    denormalizeCodexAppWorkdir(thread.cwd).toLowerCase() === normalizedWorkdir
  )) || null;
}

export function readCodexSessionIndexEntries({ codexHomeDir = "" } = {}) {
  const filePath = getCodexSessionIndexPath({ codexHomeDir });
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeCodexSessionIndexEntries({ codexHomeDir = "", entries = [] } = {}) {
  const filePath = getCodexSessionIndexPath({ codexHomeDir });
  ensureParentDirectory(filePath);
  const lines = entries.map((entry) => JSON.stringify(entry));
  fs.writeFileSync(filePath, lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

export function upsertCodexSessionIndexEntry({
  codexHomeDir = "",
  sessionId,
  title,
  updatedAt,
}) {
  const safeSessionId = textValue(sessionId);
  if (!safeSessionId) {
    return;
  }

  const safeTitle = textValue(title) || "Conversation";
  const safeUpdatedAt = toSessionIndexTimestamp(updatedAt);
  const current = readCodexSessionIndexEntries({ codexHomeDir })
    .filter((entry) => String(entry?.id || "").trim() !== safeSessionId);

  current.push({
    id: safeSessionId,
    thread_name: safeTitle,
    updated_at: safeUpdatedAt,
  });

  current.sort((left, right) => (
    Date.parse(String(right?.updated_at || "")) - Date.parse(String(left?.updated_at || ""))
  ));

  writeCodexSessionIndexEntries({
    codexHomeDir,
    entries: current,
  });
}

export function removeCodexSessionIndexEntry({ codexHomeDir = "", sessionId = "" } = {}) {
  const safeSessionId = textValue(sessionId);
  if (!safeSessionId) {
    return;
  }
  const nextEntries = readCodexSessionIndexEntries({ codexHomeDir })
    .filter((entry) => String(entry?.id || "").trim() !== safeSessionId);
  writeCodexSessionIndexEntries({
    codexHomeDir,
    entries: nextEntries,
  });
}

export function upsertCodexAppThread({ codexHomeDir = "", thread }) {
  const db = openCodexStateDatabase({ codexHomeDir, readonly: false });
  if (!db) {
    return null;
  }

  try {
    bootstrapCodexAppRegistry(db);
    const row = {
      id: textValue(thread?.id),
      rollout_path: textValue(thread?.rollout_path),
      created_at: toUnixSeconds(thread?.created_at),
      updated_at: toUnixSeconds(thread?.updated_at),
      source: textValue(thread?.source) || "vscode",
      model_provider: textValue(thread?.model_provider) || "openai",
      cwd: normalizeCodexAppWorkdir(thread?.cwd),
      title: textValue(thread?.title) || "Conversation",
      sandbox_policy: textValue(thread?.sandbox_policy) || "{\"type\":\"workspace-write\",\"writable_roots\":[],\"network_access\":false}",
      approval_mode: textValue(thread?.approval_mode) || "on-request",
      tokens_used: Math.max(0, Number.parseInt(String(thread?.tokens_used || 0), 10) || 0),
      has_user_event: Number(thread?.has_user_event) ? 1 : 0,
      archived: Number(thread?.archived) ? 1 : 0,
      archived_at: thread?.archived_at ?? null,
      git_sha: textValue(thread?.git_sha) || null,
      git_branch: textValue(thread?.git_branch) || null,
      git_origin_url: textValue(thread?.git_origin_url) || null,
      cli_version: textValue(thread?.cli_version),
      first_user_message: textValue(thread?.first_user_message),
      agent_nickname: textValue(thread?.agent_nickname) || null,
      agent_role: textValue(thread?.agent_role) || null,
      memory_mode: textValue(thread?.memory_mode) || "enabled",
    };

    db.prepare(`
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
        git_sha, git_branch, git_origin_url, cli_version, first_user_message,
        agent_nickname, agent_role, memory_mode
      ) VALUES (
        @id, @rollout_path, @created_at, @updated_at, @source, @model_provider, @cwd, @title,
        @sandbox_policy, @approval_mode, @tokens_used, @has_user_event, @archived, @archived_at,
        @git_sha, @git_branch, @git_origin_url, @cli_version, @first_user_message,
        @agent_nickname, @agent_role, @memory_mode
      )
      ON CONFLICT(id) DO UPDATE SET
        rollout_path = excluded.rollout_path,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        source = excluded.source,
        model_provider = excluded.model_provider,
        cwd = excluded.cwd,
        title = excluded.title,
        sandbox_policy = excluded.sandbox_policy,
        approval_mode = excluded.approval_mode,
        tokens_used = excluded.tokens_used,
        has_user_event = excluded.has_user_event,
        archived = excluded.archived,
        archived_at = excluded.archived_at,
        git_sha = excluded.git_sha,
        git_branch = excluded.git_branch,
        git_origin_url = excluded.git_origin_url,
        cli_version = excluded.cli_version,
        first_user_message = excluded.first_user_message,
        agent_nickname = excluded.agent_nickname,
        agent_role = excluded.agent_role,
        memory_mode = excluded.memory_mode
    `).run(row);

    return db.prepare("SELECT * FROM threads WHERE id = ? LIMIT 1").get(row.id) || null;
  } finally {
    db.close();
  }
}

export function removeCodexAppThread({ codexHomeDir = "", sessionId = "" } = {}) {
  const safeSessionId = textValue(sessionId);
  if (!safeSessionId) {
    return;
  }

  const db = openCodexStateDatabase({ codexHomeDir, readonly: false });
  if (!db) {
    return;
  }

  try {
    db.prepare("DELETE FROM threads WHERE id = ?").run(safeSessionId);
  } finally {
    db.close();
  }
}

export function archiveCodexAppThread({ codexHomeDir = "", sessionId = "" } = {}) {
  const safeSessionId = textValue(sessionId);
  if (!safeSessionId) {
    return null;
  }

  const db = openCodexStateDatabase({ codexHomeDir, readonly: false });
  if (!db) {
    return null;
  }

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE threads
      SET archived = 1,
          archived_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nowSeconds, nowSeconds, safeSessionId);

    return db.prepare("SELECT * FROM threads WHERE id = ? LIMIT 1").get(safeSessionId) || null;
  } finally {
    db.close();
  }
}
