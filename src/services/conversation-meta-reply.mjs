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

function detectRequestKind(task) {
  const value = normalizeText(task).toLowerCase();
  if (!value) {
    return "";
  }

  const rules = [
    {
      kind: "first_user_message",
      patterns: [
        /\bwhat(?:'s|\s+is|\s+was)\s+my\s+first\s+(?:message|prompt|request)\b/,
        /\bwhat\s+did\s+i\s+(?:say|ask|write|send)\s+first\b/,
        /\bmy\s+first\s+(?:message|prompt|request)\b/,
      ],
    },
    {
      kind: "last_user_message",
      patterns: [
        /\bwhat(?:'s|\s+is|\s+was)\s+my\s+(?:last|previous|prior)\s+(?:message|prompt|request)\b/,
        /\bwhat\s+did\s+i\s+(?:just\s+)?(?:say|ask|write|send)\b/,
        /\bmy\s+(?:last|previous|prior)\s+(?:message|prompt|request)\b/,
      ],
    },
    {
      kind: "first_assistant_message",
      patterns: [
        /\bwhat(?:'s|\s+is|\s+was)\s+your\s+first\s+(?:message|reply|response)\b/,
        /\bwhat\s+did\s+you\s+say\s+first\b/,
        /\byour\s+first\s+(?:message|reply|response)\b/,
      ],
    },
    {
      kind: "last_assistant_message",
      patterns: [
        /\bwhat(?:'s|\s+is|\s+was)\s+your\s+(?:last|previous|prior)\s+(?:message|reply|response)\b/,
        /\bwhat\s+did\s+you\s+(?:just\s+)?say\b/,
        /\byour\s+(?:last|previous|prior)\s+(?:message|reply|response)\b/,
      ],
    },
    {
      kind: "conversation_summary",
      patterns: [
        /\beverything\s+we\s+(?:talked|discussed)\s+about\b/,
        /\b(?:summari[sz]e|recap|review)\b.*\b(?:chat|thread|conversation)\b/,
        /\bwhat\s+have\s+we\s+(?:talked|discussed|done|covered)\b/,
        /\bgive\s+me\b.*\b(?:chat|thread|conversation)\b/,
        /\bwhat(?:'s|\s+is)\s+in\s+this\s+(?:chat|thread|conversation)\b/,
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(value))) {
      return rule.kind;
    }
  }

  return "";
}

function serializeConversation(jobs, maxChars = 10_000) {
  const lines = ["Visible Talkeby thread history:"];

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const user = truncate(job?.request || "", 320);
    const assistant = truncate(buildAssistantReply(job), 420);

    if (user) {
      lines.push(`${index + 1}. User: ${user}`);
    }
    if (assistant) {
      lines.push(`   Assistant: ${assistant}`);
    }
  }

  const text = lines.join("\n");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

export function buildConversationMetaReply({
  repository,
  threadId,
  currentJobId = "",
  userTask = "",
}) {
  const kind = detectRequestKind(userTask);
  if (!kind) {
    return "";
  }
  if (!repository || !threadId || typeof repository.listJobsByThread !== "function") {
    return "";
  }

  const jobs = repository
    .listJobsByThread(threadId, kind === "conversation_summary" ? 250 : 100)
    .filter((job) => String(job?.id || "") !== String(currentJobId || ""));
  if (jobs.length === 0) {
    return "There is no earlier visible Talkeby message in this thread.";
  }

  const firstJob = typeof repository.getFirstJobByThread === "function"
    ? repository.getFirstJobByThread(threadId)
    : jobs[0];
  const lastJob = jobs[jobs.length - 1];

  if (kind === "first_user_message") {
    return firstJob?.request
      ? `Your first visible message in this thread was: ${JSON.stringify(String(firstJob.request))}`
      : "I could not find your first visible message in this thread.";
  }

  if (kind === "last_user_message") {
    return lastJob?.request
      ? `Your last visible message before this one was: ${JSON.stringify(String(lastJob.request))}`
      : "I could not find your last visible message in this thread.";
  }

  if (kind === "first_assistant_message") {
    const firstAssistant = buildAssistantReply(firstJob);
    return firstAssistant
      ? `My first visible reply in this thread was: ${JSON.stringify(firstAssistant)}`
      : "I could not find my first visible reply in this thread.";
  }

  if (kind === "last_assistant_message") {
    const lastAssistant = buildAssistantReply(lastJob);
    return lastAssistant
      ? `My last visible reply before this one was: ${JSON.stringify(lastAssistant)}`
      : "I could not find my last visible reply in this thread.";
  }

  if (kind === "conversation_summary") {
    return serializeConversation(jobs);
  }

  return "";
}
