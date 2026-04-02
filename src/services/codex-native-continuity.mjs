function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function isCodexNativeThreadMode({ provider, parityMode }) {
  return String(provider || "").trim().toLowerCase() === "codex" && parityMode !== false;
}

export function isThreadJobExecuted(job) {
  const status = normalizeStatus(job?.status);
  return Boolean(job?.startedAt)
    || status === "running"
    || status === "completed"
    || status === "failed"
    || status === "cancelled";
}

export function countPriorExecutedThreadJobs(jobs, currentJobId = "") {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return 0;
  }
  return jobs.filter((job) => String(job?.id || "") !== String(currentJobId) && isThreadJobExecuted(job)).length;
}

export function isThreadJobCountedForContinuity(job) {
  return normalizeStatus(job?.status) === "completed";
}

export function countPriorContinuityTurns(jobs, currentJobId = "") {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return 0;
  }
  return jobs.filter((job) => (
    String(job?.id || "") !== String(currentJobId)
    && isThreadJobCountedForContinuity(job)
  )).length;
}

export function buildCodexNativeContinuityError({
  reason,
  threadId = "",
}) {
  const safeThreadId = String(threadId || "").trim();
  if (reason === "runtime_policy_interception") {
    return [
      "Native Codex thread continuity is incompatible with Talkeby runtime policy interception.",
      "Disable RUNTIME_POLICY_ENABLED to preserve Codex thread memory.",
    ].join(" ");
  }
  if (reason === "session_resume_disabled") {
    return [
      "Native Codex thread continuity is unavailable because CODEX_DISABLE_SESSION_RESUME=true.",
      "Set CODEX_DISABLE_SESSION_RESUME=false or start a new thread.",
    ].join(" ");
  }
  return [
    `Thread ${safeThreadId || "(unknown)"} has prior Codex history but no valid native Codex session to resume.`,
    "Start a new thread because Talkeby will not replay prior thread history into Codex prompts.",
  ].join(" ");
}

export function getCodexNativeContinuityCheck({
  parityMode,
  sessionResumeEnabled,
  runtimePolicyEnabled,
}) {
  if (parityMode === false) {
    return {
      ok: true,
      severity: "info",
      message: "Codex native continuity checks are idle because parity mode is disabled.",
      fix: "",
    };
  }
  if (!sessionResumeEnabled) {
    return {
      ok: false,
      severity: "warning",
      message: "Codex parity mode is enabled, but session resume is disabled so native continuity cannot be preserved.",
      fix: "Set CODEX_DISABLE_SESSION_RESUME=false to preserve native Codex thread memory.",
    };
  }
  if (runtimePolicyEnabled) {
    return {
      ok: false,
      severity: "warning",
      message: "Codex parity mode is enabled, but Talkeby runtime policy interception would break native Codex continuity.",
      fix: "Set RUNTIME_POLICY_ENABLED=false when using native Codex thread continuity.",
    };
  }
  return {
    ok: true,
    severity: "info",
    message: "Codex parity mode can preserve native Codex thread continuity.",
    fix: "",
  };
}
