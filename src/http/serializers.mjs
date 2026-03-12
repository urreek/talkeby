export function serializeJob(job) {
  if (!job) {
    return null;
  }
  const { chatId, ...safeJob } = job;
  return safeJob;
}

export function serializeJobs(jobs) {
  return Array.isArray(jobs) ? jobs.map((job) => serializeJob(job)) : [];
}

export function serializeEvent(event) {
  if (!event) {
    return null;
  }
  const { chatId, ...safeEvent } = event;
  return safeEvent;
}

export function serializeEvents(events) {
  return Array.isArray(events) ? events.map((event) => serializeEvent(event)) : [];
}

export function serializeRuntimeApproval(approval) {
  if (!approval) {
    return null;
  }
  const { chatId, resolvedByChatId, ...safeApproval } = approval;
  return safeApproval;
}

export function serializeRuntimeApprovals(approvals) {
  return Array.isArray(approvals)
    ? approvals.map((approval) => serializeRuntimeApproval(approval))
    : [];
}
