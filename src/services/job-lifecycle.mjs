import crypto from "node:crypto";
import { resolveAgentProfile } from "./agent-profile.mjs";

function nextQueuePosition(state, jobRunner) {
  return state.countQueuedJobs() + (jobRunner.getRunningJobId() ? 1 : 0) + 1;
}

export function getPendingJobForApproval(state, chatId, jobId) {
  if (jobId) {
    const job = state.getJobById(jobId);
    if (!job || String(job.chatId) !== String(chatId)) {
      return { error: `Job ${jobId} was not found in this chat.` };
    }
    if (job.status !== "pending_approval") {
      return { error: `Job ${jobId} is not waiting for approval (status: ${job.status}).` };
    }
    return { job };
  }

  const latest = state.getLatestPendingJobForChat(chatId);
  if (!latest) {
    return { error: "No pending approval job found. Send `do <task>` first." };
  }
  return { job: latest };
}

export function resolveStatusJobForChat(state, chatId, jobId) {
  if (jobId) {
    const job = state.getJobById(jobId);
    return job && String(job.chatId) === String(chatId) ? job : null;
  }
  return state.getLatestJobForChat(chatId);
}

export function createJobFromTask({
  state,
  eventBus,
  jobRunner,
  config,
  chatId,
  task,
  projectName = "",
  threadId,
}) {
  const normalizedTask = String(task || "").trim();
  if (!normalizedTask) {
    return { error: "Missing task text. Send `do <task>`." };
  }

  if (projectName) {
    const resolvedProject = state.resolveProjectName(projectName);
    if (!resolvedProject) {
      return { error: `Unknown project: ${projectName}` };
    }
    state.setProjectForChat(chatId, resolvedProject);
  }

  const activeProject = state.getProjectForChat(chatId);
  const resolvedThreadId = resolveOrCreateThreadIdForChat({
    state,
    config,
    chatId,
    projectName: activeProject.name,
    requestedThreadId: threadId,
  });
  const executionMode = state.getExecutionModeForChat(chatId);
  const queuePosition = nextQueuePosition(state, jobRunner);
  const now = new Date().toISOString();

  const job = state.createJob({
    id: crypto.randomUUID().slice(0, 8),
    chatId,
    threadId: resolvedThreadId || null,
    request: normalizedTask,
    projectName: activeProject.name,
    workdir: activeProject.workdir,
    status: executionMode === "interactive" ? "pending_approval" : "queued",
    pendingApprovalAt: executionMode === "interactive" ? now : "",
    queuedAt: executionMode === "interactive" ? "" : now,
  });

  // Auto-title thread from first message
  if (resolvedThreadId) {
    try {
      const thread = state.repository.getThread(resolvedThreadId);
      if (thread && String(thread.title || "").trim().toLowerCase() === "new thread") {
        const title =
          normalizedTask.length > 15
            ? normalizedTask.slice(0, 15) + "…"
            : normalizedTask;
        state.repository.updateThread(resolvedThreadId, { title });
      }
    } catch {
      // non-critical
    }
  }

  if (executionMode === "interactive") {
    eventBus.publish({
      jobId: job.id,
      chatId: job.chatId,
      eventType: "job_pending_approval",
      message: "Job created and waiting for approval.",
      payload: {
        projectName: job.projectName,
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
    chatId: job.chatId,
    eventType: "job_queued",
    message: "Job queued for execution.",
    payload: {
      queuePosition,
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

function defaultThreadSettingKey(chatId, projectName) {
  return `chat_default_thread:${String(chatId)}:${String(projectName)}`;
}

function resolveOrCreateThreadIdForChat({
  state,
  config,
  chatId,
  projectName,
  requestedThreadId,
}) {
  const requested = String(requestedThreadId || "").trim();
  if (requested) {
    return requested;
  }
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return "";
  }

  const settingKey = defaultThreadSettingKey(chatId, safeProjectName);
  const current = state.repository.getAppSetting(settingKey);
  const existingThreadId = String(current?.value || "").trim();
  if (existingThreadId) {
    const thread = state.repository.getThread(existingThreadId);
    if (thread && String(thread.projectName || "").trim() === safeProjectName) {
      return existingThreadId;
    }
  }

  const bootstrapPrompt = resolveAgentProfile(state.repository.getAgentProfile());
  const created = state.repository.createThread({
    id: `thr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectName: safeProjectName,
    title: "New thread",
    bootstrapPrompt,
    tokenBudget: config?.threads?.defaultTokenBudget ?? 12000,
    autoTrimContext: config?.threads?.autoTrimContextDefault !== false,
  });
  const threadId = String(created?.id || "").trim();
  if (!threadId) {
    return "";
  }

  state.repository.setAppSetting({
    key: settingKey,
    value: threadId,
  });
  return threadId;
}

export function approveJob({
  state,
  eventBus,
  jobRunner,
  chatId,
  jobId = "",
}) {
  const approval = getPendingJobForApproval(state, chatId, jobId);
  if (approval.error) {
    return { error: approval.error };
  }

  const queuePosition = nextQueuePosition(state, jobRunner);
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
    chatId: queuedJob.chatId,
    eventType: "job_approved",
    message: "Pending job approved.",
    payload: {
      approvedAt: queuedAt,
      queuePosition,
    },
  });
  eventBus.publish({
    jobId: queuedJob.id,
    chatId: queuedJob.chatId,
    eventType: "job_queued",
    message: "Job queued for execution.",
    payload: {
      queuePosition,
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
  chatId,
  jobId = "",
}) {
  const denial = getPendingJobForApproval(state, chatId, jobId);
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
    chatId: deniedJob.chatId,
    eventType: "job_denied",
    message: "Pending job denied by user.",
    payload: {
      deniedAt,
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
  chatId,
  jobId,
}) {
  const original = state.getJobById(jobId);
  if (!original || String(original.chatId) !== String(chatId)) {
    return { error: `Job ${jobId} was not found in this chat.` };
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
    chatId,
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
  chatId,
  jobId,
}) {
  const original = state.getJobById(jobId);
  if (!original || String(original.chatId) !== String(chatId)) {
    return { error: `Job ${jobId} was not found in this chat.` };
  }

  if (String(original.status || "").toLowerCase() !== "failed") {
    return { error: `Job ${jobId} is not failed; cannot resume from error.` };
  }

  const task = "Continue from the last error in this thread and fix it.";
  const created = createJobFromTask({
    state,
    eventBus,
    jobRunner,
    config,
    chatId,
    task,
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
