import crypto from "node:crypto";
import { buildThreadProviderPreferencePatch } from "./thread-provider-preferences.mjs";
import {
  RESUME_FROM_ERROR_TASK,
  resolveResumeSourceTask,
} from "./resume-request.mjs";

function nextQueuePosition(state, jobRunner, threadId = "") {
  return state.countQueuedJobs(threadId) + (jobRunner.isThreadRunning(threadId) ? 1 : 0) + 1;
}

function resolvePendingJob(state, jobId) {
  if (jobId) {
    const job = state.getJobById(jobId);
    if (!job) {
      return { error: `Job ${jobId} was not found.` };
    }
    if (job.status !== "pending_approval") {
      return { error: `Job ${jobId} is not waiting for approval (status: ${job.status}).` };
    }
    return { job };
  }

  const latest = state.getLatestPendingJob();
  if (!latest) {
    return { error: "No pending approval job found." };
  }
  return { job: latest };
}

function resolveThreadForProject({ repository, threadId, projectName }) {
  const requestedThreadId = String(threadId || "").trim();
  if (!requestedThreadId) {
    return { error: "threadId is required." };
  }

  const thread = repository.getThread(requestedThreadId);
  if (!thread) {
    return { error: `Thread ${requestedThreadId} was not found.` };
  }
  if (String(thread.projectName || "").trim() !== String(projectName || "").trim()) {
    return { error: `Thread ${requestedThreadId} does not belong to project ${projectName}.` };
  }
  return { thread };
}

export function createJobFromTask({
  state,
  eventBus,
  jobRunner,
  config,
  task,
  projectName = "",
  threadId,
}) {
  const normalizedTask = String(task || "").trim();
  if (!normalizedTask) {
    return { error: "Task is required." };
  }

  if (projectName) {
    const resolvedProject = state.resolveProjectName(projectName);
    if (!resolvedProject) {
      return { error: `Unknown project: ${projectName}` };
    }
    state.setProject(resolvedProject);
  }

  const activeProject = state.getProject();
  if (!activeProject.name || !activeProject.workdir) {
    return { error: "No active project is configured." };
  }

  const threadResolution = resolveThreadForProject({
    repository: state.repository,
    threadId,
    projectName: activeProject.name,
  });
  if (threadResolution.error) {
    return { error: threadResolution.error };
  }

  const executionMode = state.getExecutionMode();
  const queuePosition = nextQueuePosition(state, jobRunner, threadResolution.thread.id);
  const now = new Date().toISOString();
  const provider = typeof state.getProvider === "function" ? state.getProvider() : "";

  try {
    state.repository.updateThread(
      threadResolution.thread.id,
      buildThreadProviderPreferencePatch({
        provider,
        model: typeof state.getModel === "function" ? state.getModel() : "",
        reasoningEffort: typeof state.getReasoningEffort === "function"
          ? state.getReasoningEffort()
          : "",
      }),
    );
  } catch {
    // Non-critical thread preference update.
  }

  const job = state.createJob({
    id: crypto.randomUUID(),
    threadId: threadResolution.thread.id,
    request: normalizedTask,
    projectName: activeProject.name,
    workdir: activeProject.workdir,
    provider,
    status: executionMode === "interactive" ? "pending_approval" : "queued",
    pendingApprovalAt: executionMode === "interactive" ? now : "",
    queuedAt: executionMode === "interactive" ? "" : now,
  });

  try {
    const thread = state.repository.getThread(threadResolution.thread.id);
    if (thread && String(thread.title || "").trim().toLowerCase() === "new thread") {
      const title = normalizedTask.length > 60
        ? `${normalizedTask.slice(0, 59)}…`
        : normalizedTask;
      state.repository.updateThread(threadResolution.thread.id, { title });
    }
  } catch {
    // Non-critical thread title update.
  }

  if (executionMode === "interactive") {
    eventBus.publish({
      jobId: job.id,
      chatId: state.getOwnerId(),
      eventType: "job_pending_approval",
      message: "Job created and waiting for approval.",
      payload: {
        projectName: job.projectName,
        threadId: job.threadId,
      },
    });
    return {
      job,
      executionMode,
      queued: false,
    };
  }

  eventBus.publish({
    jobId: job.id,
    chatId: state.getOwnerId(),
    eventType: "job_queued",
    message: "Job queued for execution.",
    payload: {
      queuePosition,
      threadId: job.threadId,
    },
  });
  jobRunner.enqueue(job);

  return {
    job,
    executionMode,
    queued: true,
    queuePosition,
  };
}

export function approveJob({
  state,
  eventBus,
  jobRunner,
  jobId = "",
}) {
  const approval = resolvePendingJob(state, jobId);
  if (approval.error) {
    return { error: approval.error };
  }

  const queuePosition = nextQueuePosition(state, jobRunner, approval.job.threadId || "");
  const queuedAt = new Date().toISOString();

  const queuedJob = state.patchJob(approval.job.id, {
    status: "queued",
    approvedAt: queuedAt,
    queuedAt,
  });

  if (!queuedJob) {
    return { error: "Could not update job for approval." };
  }

  eventBus.publish({
    jobId: queuedJob.id,
    chatId: state.getOwnerId(),
    eventType: "job_approved",
    message: "Pending job approved.",
    payload: {
      approvedAt: queuedAt,
      queuePosition,
      threadId: queuedJob.threadId,
    },
  });
  eventBus.publish({
    jobId: queuedJob.id,
    chatId: state.getOwnerId(),
    eventType: "job_queued",
    message: "Job queued for execution.",
    payload: {
      queuePosition,
      threadId: queuedJob.threadId,
    },
  });
  jobRunner.enqueue(queuedJob);

  return {
    job: queuedJob,
    queuePosition,
  };
}

export function denyJob({
  state,
  eventBus,
  jobId = "",
}) {
  const denial = resolvePendingJob(state, jobId);
  if (denial.error) {
    return { error: denial.error };
  }

  const deniedAt = new Date().toISOString();
  const deniedJob = state.patchJob(denial.job.id, {
    status: "denied",
    deniedAt,
  });

  if (!deniedJob) {
    return { error: "Could not update job for denial." };
  }

  eventBus.publish({
    jobId: deniedJob.id,
    chatId: state.getOwnerId(),
    eventType: "job_denied",
    message: "Pending job denied by user.",
    payload: {
      deniedAt,
      threadId: deniedJob.threadId,
    },
  });

  return {
    job: deniedJob,
  };
}

export function retryJob({
  state,
  eventBus,
  jobRunner,
  config,
  jobId,
}) {
  const original = state.getJobById(jobId);
  if (!original) {
    return { error: `Job ${jobId} was not found.` };
  }

  const blockedStatuses = new Set(["queued", "running", "pending_approval"]);
  if (blockedStatuses.has(String(original.status || "").toLowerCase())) {
    return { error: `Job ${jobId} cannot be retried while status is "${original.status}".` };
  }

  return createJobFromTask({
    state,
    eventBus,
    jobRunner,
    config,
    task: original.request,
    projectName: original.projectName,
    threadId: original.threadId || undefined,
  });
}

export function resumeJobFromError({
  state,
  eventBus,
  jobRunner,
  config,
  jobId,
}) {
  const original = state.getJobById(jobId);
  if (!original) {
    return { error: `Job ${jobId} was not found.` };
  }

  if (String(original.status || "").toLowerCase() !== "failed") {
    return { error: `Job ${jobId} is not failed; cannot resume from error.` };
  }

  const resumeSourceTask = resolveResumeSourceTask({
    job: original,
    getJobById: (candidateJobId) => state.getJobById(candidateJobId),
  });
  if (!resumeSourceTask) {
    return { error: `Job ${jobId} does not have a recoverable user task to resume.` };
  }

  const created = createJobFromTask({
    state,
    eventBus,
    jobRunner,
    config,
    task: RESUME_FROM_ERROR_TASK,
    projectName: original.projectName,
    threadId: original.threadId || undefined,
  });
  if (created.error) {
    return created;
  }

  const patched = state.patchJob(created.job.id, {
    resumedFromJobId: original.id,
  });
  if (patched) {
    created.job = patched;
  }
  return created;
}
