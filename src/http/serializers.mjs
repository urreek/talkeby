import {
  isGeneratedResumeTask,
  resolveResumeSourceTask,
} from "../services/resume-request.mjs";

function buildJobResolver(jobs, fallbackGetJobById) {
  const byId = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const id = String(job?.id || "").trim();
    if (id) {
      byId.set(id, job);
    }
  }

  return (jobId) => {
    const safeJobId = String(jobId || "").trim();
    if (!safeJobId) {
      return null;
    }
    return byId.get(safeJobId) || fallbackGetJobById?.(safeJobId) || null;
  };
}

export function serializeJob(job, options = {}) {
  if (!job) {
    return null;
  }
  const { chatId, ...safeJob } = job;
  const request = String(safeJob.request || "");
  const displayRequest = isGeneratedResumeTask(request)
    ? (resolveResumeSourceTask({
        job: safeJob,
        getJobById: options.getJobById,
      }) || request)
    : request;
  return {
    ...safeJob,
    displayRequest,
  };
}

export function serializeJobs(jobs, options = {}) {
  if (!Array.isArray(jobs)) {
    return [];
  }

  const getJobById = buildJobResolver(jobs, options.getJobById);
  return jobs.map((job) => serializeJob(job, { getJobById }));
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
