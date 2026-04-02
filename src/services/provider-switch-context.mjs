function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxChars) {
  const text = normalizeText(value);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1))}...`;
}

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function isVisibleTurnJob(job) {
  const status = String(job?.status || "").trim().toLowerCase();
  return status === "completed"
    || status === "failed"
    || status === "cancelled"
    || status === "denied";
}

function assistantSummary(job) {
  const status = String(job?.status || "").trim().toLowerCase();
  if (status === "completed") {
    return truncate(job?.summary || "", 220);
  }

  const detail = truncate(job?.error || job?.summary || "", 200);
  if (!detail) {
    return status ? `[${status}]` : "";
  }
  return `[${status}] ${detail}`;
}

function toTurn(job) {
  const user = truncate(job?.request || "", 160);
  const assistant = assistantSummary(job);
  if (!user && !assistant) {
    return null;
  }
  return {
    user,
    assistant,
    provider: normalizeProvider(job?.provider),
  };
}

function sliceJobsAfterSync(jobs, syncedJobId = "", currentJobId = "") {
  const safeCurrentJobId = String(currentJobId || "").trim();
  const safeSyncedJobId = String(syncedJobId || "").trim();
  const filtered = jobs.filter((job) => String(job?.id || "") !== safeCurrentJobId);

  if (!safeSyncedJobId) {
    return filtered;
  }

  const syncIndex = filtered.findIndex((job) => String(job?.id || "") === safeSyncedJobId);
  if (syncIndex < 0) {
    return filtered;
  }
  return filtered.slice(syncIndex + 1);
}

function serializeTurns(turns, { fromProvider = "", toProvider = "" } = {}) {
  const source = normalizeProvider(fromProvider) || "another-provider";
  const target = normalizeProvider(toProvider) || "current-provider";
  const lines = [
    `Switch context: ${source} -> ${target}.`,
    "Preserve decisions and avoid repeating completed work.",
    "Unseen turns (oldest -> newest):",
  ];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const user = turn.user || "(empty)";
    lines.push(`${index + 1}. U: ${user}`);
    if (turn.assistant) {
      lines.push(`   A: ${turn.assistant}`);
    }
  }

  return lines.join("\n");
}

export function buildProviderSwitchContext({
  repository,
  threadId,
  currentJobId = "",
  syncedJobId = "",
  fromProvider = "",
  toProvider = "",
  maxTurns = 4,
  maxChars = 1400,
}) {
  if (!repository || !threadId || typeof repository.listJobsByThread !== "function") {
    return "";
  }

  const safeMaxTurns = Math.max(1, Math.min(Number(maxTurns) || 4, 8));
  const safeMaxChars = Math.max(200, Number(maxChars) || 1400);
  const jobs = repository.listJobsByThread(threadId, 5000);
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return "";
  }

  const deltaJobs = sliceJobsAfterSync(jobs, syncedJobId, currentJobId);
  const turns = deltaJobs
    .filter((job) => isVisibleTurnJob(job))
    .map((job) => toTurn(job))
    .filter(Boolean);

  if (turns.length === 0) {
    return "";
  }

  const latestTurns = turns.slice(-safeMaxTurns);
  for (let keep = latestTurns.length; keep >= 1; keep -= 1) {
    const candidate = serializeTurns(latestTurns.slice(-keep), {
      fromProvider,
      toProvider,
    });
    if (candidate.length <= safeMaxChars) {
      return candidate;
    }
  }

  return truncate(
    serializeTurns(latestTurns.slice(-1), {
      fromProvider,
      toProvider,
    }),
    safeMaxChars,
  );
}
