const NATIVE_PROVIDER_SESSION_IDS = new Set([
  "codex",
  "claude",
  "gemini",
  "copilot",
]);

const FINALIZED_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "denied",
]);

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value) {
  return textValue(String(value || "")).toLowerCase();
}

export function providerLabel(provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === "codex") return "Codex";
  if (normalized === "claude") return "Claude";
  if (normalized === "gemini") return "Gemini";
  if (normalized === "copilot") return "GitHub Copilot";
  return normalized || "provider";
}

export function normalizeProvider(value) {
  return textValue(String(value || "")).toLowerCase();
}

export function supportsNativeProviderSessions(provider) {
  return NATIVE_PROVIDER_SESSION_IDS.has(normalizeProvider(provider));
}

export function getJobProvider(job, fallbackProvider = "") {
  return normalizeProvider(job?.provider) || normalizeProvider(fallbackProvider);
}

export function isFinalizedThreadJob(job) {
  return FINALIZED_STATUSES.has(normalizeStatus(job?.status))
    || Boolean(textValue(job?.startedAt));
}

export function isCompletedThreadJob(job) {
  return normalizeStatus(job?.status) === "completed";
}

export function getLatestPriorProvider(jobs, { currentJobId = "" } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return "";
  }

  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (String(job?.id || "") === String(currentJobId || "")) {
      continue;
    }
    if (!isFinalizedThreadJob(job)) {
      continue;
    }
    const provider = normalizeProvider(job?.provider);
    if (provider) {
      return provider;
    }
  }

  return "";
}

export function countPriorProviderContinuityTurns(
  jobs,
  {
    currentJobId = "",
    provider = "",
    legacyFallbackProvider = "",
  } = {},
) {
  const targetProvider = normalizeProvider(provider);
  if (!targetProvider || !Array.isArray(jobs) || jobs.length === 0) {
    return 0;
  }

  return jobs.filter((job) => (
    String(job?.id || "") !== String(currentJobId || "")
    && isCompletedThreadJob(job)
    && getJobProvider(job, legacyFallbackProvider) === targetProvider
  )).length;
}

export function buildProviderNativeContinuityError({
  provider,
  threadId = "",
}) {
  const label = providerLabel(provider);
  const safeThreadId = textValue(threadId) || "(unknown)";
  return [
    `Thread ${safeThreadId} has prior ${label} history but no valid native ${label} session to resume.`,
    "Start a new thread or switch providers so Talkeby can bootstrap compact thread context.",
  ].join(" ");
}
