function toTimestamp(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function toSeconds(valueMs) {
  return Math.max(0, valueMs / 1000);
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export function buildObservabilitySummary({
  jobs,
  runtimeApprovals,
  windowDays = 7,
}) {
  const now = Date.now();
  const windowStart = now - Math.max(1, Number(windowDays) || 7) * 24 * 60 * 60 * 1000;
  const last24h = now - 24 * 60 * 60 * 1000;

  const scopedJobs = jobs.filter((job) => toTimestamp(job.createdAt) >= windowStart);
  const completed = scopedJobs.filter((job) => job.status === "completed");
  const failed = scopedJobs.filter((job) => job.status === "failed");
  const denied = scopedJobs.filter((job) => job.status === "denied");
  const pendingApproval = scopedJobs.filter((job) => job.status === "pending_approval");
  const queued = scopedJobs.filter((job) => job.status === "queued");
  const running = scopedJobs.filter((job) => job.status === "running");

  const durationSeconds = completed
    .map((job) => {
      const started = toTimestamp(job.startedAt);
      const finished = toTimestamp(job.completedAt);
      if (!started || !finished || finished < started) {
        return 0;
      }
      return toSeconds(finished - started);
    })
    .filter((value) => value > 0);

  const queueWaitSeconds = scopedJobs
    .map((job) => {
      const created = toTimestamp(job.createdAt);
      const queuedAt = toTimestamp(job.queuedAt);
      if (!created || !queuedAt || queuedAt < created) {
        return 0;
      }
      return toSeconds(queuedAt - created);
    })
    .filter((value) => value > 0);

  const scopedApprovals = runtimeApprovals.filter((item) => toTimestamp(item.createdAt) >= windowStart);
  const pendingRuntimeApprovals = scopedApprovals.filter((item) => item.status === "pending");
  const resolvedRuntimeApprovals = scopedApprovals.filter((item) => item.resolvedAt);

  const runtimeApprovalSeconds = resolvedRuntimeApprovals
    .map((item) => {
      const created = toTimestamp(item.createdAt);
      const resolved = toTimestamp(item.resolvedAt);
      if (!created || !resolved || resolved < created) {
        return 0;
      }
      return toSeconds(resolved - created);
    })
    .filter((value) => value > 0);

  const jobsLast24h = scopedJobs.filter((job) => toTimestamp(job.createdAt) >= last24h);

  return {
    windowDays: Math.max(1, Number(windowDays) || 7),
    generatedAt: new Date(now).toISOString(),
    jobs: {
      total: scopedJobs.length,
      completed: completed.length,
      failed: failed.length,
      denied: denied.length,
      running: running.length,
      queued: queued.length,
      pendingApproval: pendingApproval.length,
      successRate: scopedJobs.length ? Number((completed.length / scopedJobs.length).toFixed(4)) : 0,
      avgDurationSeconds: Number(average(durationSeconds).toFixed(2)),
      p95DurationSeconds: Number(percentile(durationSeconds, 95).toFixed(2)),
      avgQueueWaitSeconds: Number(average(queueWaitSeconds).toFixed(2)),
      throughputLast24h: jobsLast24h.length,
    },
    runtimeApprovals: {
      total: scopedApprovals.length,
      pending: pendingRuntimeApprovals.length,
      resolved: resolvedRuntimeApprovals.length,
      avgDecisionSeconds: Number(average(runtimeApprovalSeconds).toFixed(2)),
    },
  };
}
