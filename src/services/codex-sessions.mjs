import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSION_ID_PATTERN = /\bsession id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;
const SESSION_FILE_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

function normalizeSessionId(value) {
  const text = String(value || "").trim().toLowerCase();
  return SESSION_FILE_PATTERN.test(`${text}.jsonl`) ? text : "";
}

function normalizeWorkdir(value) {
  const text = String(value || "").trim();
  return text ? path.resolve(text).toLowerCase() : "";
}

function isLikelyTaskMessage(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  return !value.startsWith("# AGENTS.md instructions")
    && !value.startsWith("<environment_context>");
}

function parseJsonl(text) {
  return String(text || "")
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

async function walkFiles(dirPath, onFile) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, onFile);
      continue;
    }
    if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}

export function getCodexSessionsDir() {
  return path.join(os.homedir(), ".codex", "sessions");
}

export function extractCodexSessionIdFromText(value) {
  const match = String(value || "").match(SESSION_ID_PATTERN);
  return normalizeSessionId(match?.[1] || "");
}

export async function readCodexSessionFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const rows = parseJsonl(text);
  const metaRow = rows.find((row) => row?.type === "session_meta");
  const meta = metaRow?.payload || null;
  const taskMessageCount = rows.filter((row) => {
    if (row?.type !== "response_item") {
      return false;
    }
    if (String(row?.payload?.role || "").toLowerCase() !== "user") {
      return false;
    }
    const parts = Array.isArray(row?.payload?.content) ? row.payload.content : [];
    const textValue = parts
      .map((part) => (part?.text ? String(part.text) : ""))
      .filter(Boolean)
      .join(" ")
      || String(row?.payload?.text || "");
    return isLikelyTaskMessage(textValue);
  }).length;

  return {
    rows,
    meta,
    taskMessageCount,
  };
}

export async function findCodexSessionFiles(sessionId) {
  const safeSessionId = normalizeSessionId(sessionId);
  if (!safeSessionId) {
    return [];
  }

  const matches = [];
  await walkFiles(getCodexSessionsDir(), async (filePath) => {
    if (!filePath.endsWith(".jsonl")) {
      return;
    }
    if (filePath.toLowerCase().includes(safeSessionId)) {
      matches.push(filePath);
    }
  });
  return matches.sort();
}

export async function inspectCodexSession({ sessionId, workdir = "" }) {
  const files = await findCodexSessionFiles(sessionId);
  const expectedWorkdir = normalizeWorkdir(workdir);
  let bestMatch = null;

  for (const filePath of files) {
    try {
      const parsed = await readCodexSessionFile(filePath);
      const meta = parsed.meta || {};
      const metaSessionId = normalizeSessionId(meta.id || "");
      const metaWorkdir = normalizeWorkdir(meta.cwd || "");
      const originator = String(meta.originator || "").trim().toLowerCase();
      const stat = await fs.stat(filePath).catch(() => null);

      if (metaSessionId && metaSessionId !== normalizeSessionId(sessionId)) {
        continue;
      }
      if (expectedWorkdir && metaWorkdir && metaWorkdir !== expectedWorkdir) {
        continue;
      }

      const candidate = {
        filePath,
        sessionId: normalizeSessionId(sessionId),
        originator,
        workdir: meta.cwd || "",
        taskMessageCount: parsed.taskMessageCount,
        mtimeMs: stat?.mtimeMs || 0,
      };

      if (
        !bestMatch
        || candidate.taskMessageCount > bestMatch.taskMessageCount
        || (
          candidate.taskMessageCount === bestMatch.taskMessageCount
          && candidate.mtimeMs > bestMatch.mtimeMs
        )
      ) {
        bestMatch = candidate;
      }
    } catch {
      // Ignore malformed files and keep searching.
    }
  }

  return bestMatch;
}

export async function validateCodexSession({
  sessionId,
  workdir = "",
  minTaskMessages = 0,
}) {
  const safeSessionId = normalizeSessionId(sessionId);
  if (!safeSessionId) {
    return {
      ok: false,
      reason: "missing_session_id",
      session: null,
    };
  }

  const session = await inspectCodexSession({
    sessionId: safeSessionId,
    workdir,
  });
  if (!session) {
    return {
      ok: false,
      reason: "missing_session_file",
      session: null,
    };
  }
  if (session.originator !== "talkeby") {
    return {
      ok: false,
      reason: "origin_mismatch",
      session,
    };
  }
  if (session.taskMessageCount < Math.max(0, Number(minTaskMessages) || 0)) {
    return {
      ok: false,
      reason: "insufficient_history",
      session,
    };
  }

  return {
    ok: true,
    reason: "",
    session,
  };
}

export async function findNewTalkebySession({
  afterMs,
  workdir = "",
}) {
  const expectedWorkdir = normalizeWorkdir(workdir);
  let newest = null;

  await walkFiles(getCodexSessionsDir(), async (filePath) => {
    if (!filePath.endsWith(".jsonl")) {
      return;
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return;
    }
    if (stat.mtimeMs < Number(afterMs || 0)) {
      return;
    }

    try {
      const parsed = await readCodexSessionFile(filePath);
      const meta = parsed.meta || {};
      const sessionId = normalizeSessionId(meta.id || "");
      const metaWorkdir = normalizeWorkdir(meta.cwd || "");
      const originator = String(meta.originator || "").trim().toLowerCase();
      if (!sessionId || originator !== "talkeby") {
        return;
      }
      if (expectedWorkdir && metaWorkdir && metaWorkdir !== expectedWorkdir) {
        return;
      }
      if (!newest || stat.mtimeMs > newest.mtimeMs) {
        newest = {
          filePath,
          sessionId,
          mtimeMs: stat.mtimeMs,
        };
      }
    } catch {
      // Ignore malformed files and keep searching.
    }
  });

  return newest;
}

export async function deleteCodexSessionFiles(sessionId) {
  const files = await findCodexSessionFiles(sessionId);
  for (const filePath of files) {
    try {
      await fs.unlink(filePath);
    } catch {
      // Best-effort cleanup.
    }
  }
  return files.length;
}
