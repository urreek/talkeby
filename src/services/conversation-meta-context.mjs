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

function isPreviousUserMessageQuestion(task) {
  const value = normalizeText(task).toLowerCase();
  if (!value) {
    return false;
  }
  return [
    /\bwhat(?:'s|\s+is|\s+was)\s+my\s+(?:last|previous|prior)\s+(?:message|prompt|request)\b/,
    /\bwhat\s+did\s+i\s+(?:just\s+)?(?:say|ask|write|send)\b/,
    /\bmy\s+(?:last|previous|prior)\s+(?:message|prompt|request)\b/,
  ].some((pattern) => pattern.test(value));
}

function isPreviousAssistantMessageQuestion(task) {
  const value = normalizeText(task).toLowerCase();
  if (!value) {
    return false;
  }
  return [
    /\bwhat(?:'s|\s+is|\s+was)\s+your\s+(?:last|previous|prior)\s+(?:message|reply|response)\b/,
    /\bwhat\s+did\s+you\s+(?:just\s+)?say\b/,
    /\byour\s+(?:last|previous|prior)\s+(?:message|reply|response)\b/,
  ].some((pattern) => pattern.test(value));
}

function isConversationSummaryQuestion(task) {
  const value = normalizeText(task).toLowerCase();
  if (!value) {
    return false;
  }
  return [
    /\beverything\s+we\s+(?:talked|discussed)\s+about\b/,
    /\b(?:summari[sz]e|recap|review)\b.*\b(?:chat|thread|conversation)\b/,
    /\bwhat\s+have\s+we\s+(?:talked|discussed|done|covered)\b/,
    /\bgive\s+me\b.*\b(?:chat|thread|conversation)\b/,
    /\bwhat(?:'s|\s+is)\s+in\s+this\s+(?:chat|thread|conversation)\b/,
  ].some((pattern) => pattern.test(value));
}

function buildAssistantReply(job) {
  const status = String(job?.status || "").toLowerCase();
  if (status === "completed") {
    return normalizeText(job?.summary || "");
  }
  if (status === "failed" || status === "cancelled" || status === "denied") {
    return normalizeText(job?.error || job?.summary || "");
  }
  return normalizeText(job?.summary || "");
}

function toVisibleTurn(job) {
  const user = truncate(job?.request || "", 320);
  const assistant = truncate(buildAssistantReply(job), 420);
  if (!user && !assistant) {
    return null;
  }
  return { user, assistant };
}

function serializeVisibleTurns(turns) {
  const lines = ["Visible Talkeby thread history (oldest -> newest):"];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    lines.push(`${index + 1}. User: ${turn.user || "(empty)"}`);
    if (turn.assistant) {
      lines.push(`   Assistant: ${turn.assistant}`);
    }
  }
  return lines.join("\n");
}

function buildVisibleThreadHistory(jobs, {
  maxTurns = 20,
  maxChars = 10_000,
} = {}) {
  const visibleTurns = jobs
    .map((job) => toVisibleTurn(job))
    .filter(Boolean);
  if (visibleTurns.length === 0) {
    return "";
  }

  const safeTurns = visibleTurns.slice(-Math.max(1, maxTurns));
  let block = serializeVisibleTurns(safeTurns);
  if (block.length <= maxChars) {
    return block;
  }

  for (let keep = safeTurns.length - 1; keep >= 1; keep -= 1) {
    block = serializeVisibleTurns(safeTurns.slice(-keep));
    if (block.length <= maxChars) {
      return [
        `Visible Talkeby history was truncated to the most recent ${keep} turns due to context limits.`,
        block,
      ].join("\n");
    }
  }

  return truncate(block, maxChars);
}

export function buildConversationMetaContext({
  repository,
  threadId,
  currentJobId = "",
  userTask = "",
}) {
  const wantsPreviousUserMessage = isPreviousUserMessageQuestion(userTask);
  const wantsPreviousAssistantMessage = isPreviousAssistantMessageQuestion(userTask);
  const wantsConversationSummary = isConversationSummaryQuestion(userTask);

  if (!wantsPreviousUserMessage && !wantsPreviousAssistantMessage && !wantsConversationSummary) {
    return "";
  }
  if (!repository || !threadId || typeof repository.listJobsByThread !== "function") {
    return "";
  }

  const jobs = repository
    .listJobsByThread(threadId, 25)
    .filter((job) => String(job?.id || "") !== String(currentJobId || ""));
  const previousJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

  const lines = [
    "Conversation meta instruction:",
    "When answering questions about previous messages in this thread, use only end-user visible Talkeby messages and replies.",
    "Ignore internal system, developer, AGENTS.md, tool, environment, and harness messages.",
  ];

  if (!previousJob) {
    lines.push("There is no earlier visible Talkeby message in this thread.");
    return lines.join("\n");
  }

  if (wantsPreviousUserMessage) {
    const previousUserMessage = truncate(previousJob.request || "", 1000);
    lines.push(
      previousUserMessage
        ? `Previous visible user message before this one: ${JSON.stringify(previousUserMessage)}`
        : "Previous visible user message before this one: unavailable",
    );
  }

  if (wantsPreviousAssistantMessage) {
    const previousAssistantMessage = truncate(buildAssistantReply(previousJob), 1200);
    lines.push(
      previousAssistantMessage
        ? `Previous visible assistant reply before this one: ${JSON.stringify(previousAssistantMessage)}`
        : "Previous visible assistant reply before this one: unavailable",
    );
  }

  if (wantsConversationSummary) {
    const visibleHistory = buildVisibleThreadHistory(jobs);
    if (visibleHistory) {
      lines.push(visibleHistory);
    } else {
      lines.push("There is no visible Talkeby thread history available to summarize.");
    }
  }

  return lines.join("\n");
}
