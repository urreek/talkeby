import { readCodexSessionFile } from "./codex-sessions.mjs";

function textValue(value) {
  return String(value || "").trim();
}

function extractMessageText(payload) {
  const parts = Array.isArray(payload?.content) ? payload.content : [];
  const fromParts = parts
    .map((part) => {
      if (part?.text) {
        return String(part.text);
      }
      if (part?.type === "input_text" || part?.type === "output_text") {
        return String(part?.text || "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
  return textValue(fromParts || payload?.text || "");
}

function isVisibleUserMessage(text) {
  return Boolean(text)
    && !text.startsWith("# AGENTS.md instructions")
    && !text.startsWith("<environment_context>");
}

function normalizeComparableText(value) {
  return textValue(value).replace(/\s+/g, " ").toLowerCase();
}

function buildTranscriptTurns(rows) {
  const turns = [];
  let pendingUser = null;

  for (const row of rows) {
    if (row?.type !== "response_item") {
      continue;
    }

    const payload = row?.payload || {};
    const role = textValue(payload.role).toLowerCase();
    const messageText = extractMessageText(payload);
    const timestamp = textValue(row?.timestamp || "");

    if (role === "user") {
      if (!isVisibleUserMessage(messageText)) {
        continue;
      }
      pendingUser = {
        request: messageText,
        createdAt: timestamp,
      };
      continue;
    }

    if (role === "assistant" && pendingUser && messageText) {
      turns.push({
        ...pendingUser,
        summary: messageText,
        completedAt: timestamp || pendingUser.createdAt,
      });
      pendingUser = null;
    }
  }

  return turns;
}

function collectMatchedTurnIndexes(turns, persistedJobs) {
  const matched = new Set();
  const comparableTurns = turns.map((turn) => normalizeComparableText(turn.request));
  const orderedJobs = persistedJobs
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.createdAt || ""));
      const rightTime = Date.parse(String(right.createdAt || ""));
      return rightTime - leftTime;
    });

  for (const job of orderedJobs) {
    const target = normalizeComparableText(job.request);
    if (!target) {
      continue;
    }
    for (let index = comparableTurns.length - 1; index >= 0; index -= 1) {
      if (matched.has(index)) {
        continue;
      }
      if (comparableTurns[index] !== target) {
        continue;
      }
      matched.add(index);
      break;
    }
  }

  return matched;
}

export async function buildCodexTranscriptJobs({
  sessionFilePath,
  threadId,
  projectName,
  workdir,
  persistedJobs = [],
}) {
  if (!sessionFilePath) {
    return [];
  }

  const parsed = await readCodexSessionFile(sessionFilePath);
  const turns = buildTranscriptTurns(parsed.rows || []);
  if (turns.length === 0) {
    return [];
  }

  const matchedTurnIndexes = collectMatchedTurnIndexes(turns, persistedJobs);
  return turns
    .filter((_, index) => !matchedTurnIndexes.has(index))
    .map((turn, index) => ({
      id: `native-${threadId}-${index + 1}`,
      threadId: threadId || null,
      request: turn.request,
      projectName: projectName || "",
      workdir: workdir || "",
      status: "completed",
      createdAt: turn.createdAt || turn.completedAt || new Date().toISOString(),
      queuedAt: null,
      pendingApprovalAt: null,
      approvedAt: null,
      startedAt: turn.createdAt || turn.completedAt || null,
      completedAt: turn.completedAt || turn.createdAt || null,
      deniedAt: null,
      cancelledAt: null,
      resumedFromJobId: null,
      tokenSource: "native_history",
      tokenInput: null,
      tokenOutput: null,
      tokenTotal: null,
      providerCostUsd: null,
      summary: turn.summary,
      error: null,
    }));
}
