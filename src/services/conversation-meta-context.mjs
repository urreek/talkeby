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

export function buildConversationMetaContext({
  repository,
  threadId,
  currentJobId = "",
  userTask = "",
}) {
  const wantsPreviousUserMessage = isPreviousUserMessageQuestion(userTask);
  const wantsPreviousAssistantMessage = isPreviousAssistantMessageQuestion(userTask);

  if (!wantsPreviousUserMessage && !wantsPreviousAssistantMessage) {
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

  return lines.join("\n");
}
