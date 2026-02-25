function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxChars) {
  const text = normalizeText(value);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function toHistoryTurn(job) {
  const user = truncate(job?.request || "", 220);
  const status = String(job?.status || "").toLowerCase();

  let assistant = "";
  if (status === "completed") {
    assistant = truncate(job?.summary || "", 320);
  } else if (status === "failed" || status === "cancelled" || status === "denied") {
    const detail = truncate(job?.error || job?.summary || "", 280);
    assistant = detail ? `[${status}] ${detail}` : `[${status}]`;
  } else {
    assistant = truncate(job?.summary || "", 320);
  }

  if (!user && !assistant) {
    return null;
  }

  return { user, assistant };
}

function serializeTurns(turns) {
  const lines = [
    "Recent thread context (oldest -> newest):",
  ];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const user = turn.user || "(empty)";
    lines.push(`${index + 1}. User: ${user}`);
    if (turn.assistant) {
      lines.push(`   Assistant: ${turn.assistant}`);
    }
  }

  return lines.join("\n");
}

function extractLatestUserFacts(turns) {
  let declaredName = "";

  for (const turn of turns) {
    const user = String(turn?.user || "");
    const match = user.match(/\bmy name is\s+([a-zA-Z][a-zA-Z0-9_\- ]{0,40})\b/i);
    if (match && match[1]) {
      declaredName = match[1].trim();
    }
  }

  return {
    name: declaredName,
  };
}

function serializeFacts(facts) {
  const name = String(facts?.name || "").trim();
  if (!name) {
    return "";
  }
  return [
    "Remembered user facts from this thread:",
    `- Name: ${name}`,
    "If asked about the user's name, use this value unless the user updates it.",
  ].join("\n");
}

export function buildThreadHistoryContext({
  repository,
  threadId,
  currentJobId = "",
  maxTurns = 8,
  maxChars = 3200,
}) {
  if (!repository || !threadId || typeof repository.listJobsByThread !== "function") {
    return "";
  }

  const safeMaxTurns = Math.max(1, Math.min(Number(maxTurns) || 8, 20));
  const safeMaxChars = Math.max(200, Number(maxChars) || 3200);
  const fetchLimit = Math.max(20, safeMaxTurns * 5);
  const allJobs = repository.listJobsByThread(threadId, fetchLimit);
  if (!Array.isArray(allJobs) || allJobs.length === 0) {
    return "";
  }

  const turns = [];
  for (const job of allJobs) {
    if (currentJobId && String(job?.id || "") === String(currentJobId)) {
      continue;
    }
    const turn = toHistoryTurn(job);
    if (turn) {
      turns.push(turn);
    }
  }

  if (turns.length === 0) {
    return "";
  }

  const latestTurns = turns.slice(-safeMaxTurns);
  const facts = extractLatestUserFacts(latestTurns);
  const factsBlock = serializeFacts(facts);
  const turnsBlock = serializeTurns(latestTurns);
  const full = factsBlock ? `${factsBlock}\n\n${turnsBlock}` : turnsBlock;
  if (full.length <= safeMaxChars) {
    return full;
  }

  for (let keep = latestTurns.length - 1; keep >= 1; keep -= 1) {
    const trimmed = serializeTurns(latestTurns.slice(-keep));
    if (trimmed.length <= safeMaxChars) {
      return trimmed;
    }
  }

  return truncate(full, safeMaxChars);
}
