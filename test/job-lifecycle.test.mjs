import test from "node:test";
import assert from "node:assert/strict";

import { createJobFromTask, resumeJobFromError } from "../src/services/job-lifecycle.mjs";

function createHarness() {
  const jobs = new Map();
  const project = {
    name: "demo",
    workdir: "C:/Users/urimk/Desktop/dev/talkeby",
  };
  const thread = {
    id: "thread-1",
    projectName: project.name,
    title: "Thread",
  };
  const threadPatches = [];

  const state = {
    repository: {
      getThread(threadId) {
        return threadId === thread.id ? thread : null;
      },
      updateThread(threadId, patch) {
        threadPatches.push({ threadId, patch });
      },
    },
    getOwnerId() {
      return "owner-1";
    },
    countQueuedJobs() {
      return 0;
    },
    getExecutionMode() {
      return "auto";
    },
    getProvider() {
      return "copilot";
    },
    getModel() {
      return "gpt-5-mini";
    },
    getReasoningEffort() {
      return "high";
    },
    resolveProjectName(projectName) {
      return projectName === project.name ? project.name : "";
    },
    setProject() {},
    getProject() {
      return project;
    },
    getJobById(jobId) {
      return jobs.get(jobId) || null;
    },
    createJob(input) {
      const job = {
        ...input,
        chatId: input.chatId || "owner-1",
        resumedFromJobId: input.resumedFromJobId || null,
      };
      jobs.set(job.id, job);
      return job;
    },
    patchJob(jobId, patch) {
      const current = jobs.get(jobId);
      if (!current) {
        return null;
      }
      const next = { ...current, ...patch };
      jobs.set(jobId, next);
      return next;
    },
  };

  const eventBus = {
    publish() {},
  };
  const jobRunner = {
    getRunningJobId() {
      return "";
    },
    isThreadRunning() {
      return false;
    },
    enqueue() {},
  };

  return {
    jobs,
    threadPatches,
    state,
    eventBus,
    jobRunner,
  };
}

test("resumeJobFromError queues a continuation task instead of replaying the original request", () => {
  const { jobs, state, eventBus, jobRunner } = createHarness();
  jobs.set("failed-1", {
    id: "failed-1",
    status: "failed",
    request: "Fix the reasoning effort bug",
    projectName: "demo",
    threadId: "thread-1",
    resumedFromJobId: null,
  });

  const created = resumeJobFromError({
    state,
    eventBus,
    jobRunner,
    config: {},
    jobId: "failed-1",
  });

  assert.equal(created.error, undefined);
  assert.equal(created.job.request, "Continue from the last error in this thread and fix it.");
  assert.equal(created.job.resumedFromJobId, "failed-1");
});

test("createJobFromTask persists the active provider on the created job", () => {
  const { state, eventBus, jobRunner, threadPatches } = createHarness();

  const created = createJobFromTask({
    state,
    eventBus,
    jobRunner,
    config: {},
    task: "Keep continuity when I switch providers",
    projectName: "demo",
    threadId: "thread-1",
  });

  assert.equal(created.error, undefined);
  assert.equal(created.job.provider, "copilot");
  assert.deepEqual(threadPatches, [
    {
      threadId: "thread-1",
      patch: {
        lastProvider: "copilot",
        lastModel: "gpt-5-mini",
        lastReasoningEffort: "high",
      },
    },
  ]);
});

test("resumeJobFromError follows the resume chain back to the last real user request", () => {
  const { jobs, state, eventBus, jobRunner } = createHarness();
  jobs.set("root-1", {
    id: "root-1",
    status: "failed",
    request: "Fix the thread continuity validator",
    projectName: "demo",
    threadId: "thread-1",
    resumedFromJobId: null,
  });
  jobs.set("resume-1", {
    id: "resume-1",
    status: "failed",
    request: "Continue from the last error in this thread and fix it.",
    projectName: "demo",
    threadId: "thread-1",
    resumedFromJobId: "root-1",
  });

  const created = resumeJobFromError({
    state,
    eventBus,
    jobRunner,
    config: {},
    jobId: "resume-1",
  });

  assert.equal(created.error, undefined);
  assert.equal(created.job.request, "Continue from the last error in this thread and fix it.");
  assert.equal(created.job.resumedFromJobId, "resume-1");
});
