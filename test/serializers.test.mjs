import test from "node:test";
import assert from "node:assert/strict";

import { serializeJob, serializeJobs } from "../src/http/serializers.mjs";

test("serializeJob exposes the recovered display request for generated resume tasks", () => {
  const rootJob = {
    id: "root-1",
    chatId: "owner-1",
    request: "Fix the interrupted thread continuity run",
    resumedFromJobId: null,
  };
  const resumedJob = {
    id: "resume-1",
    chatId: "owner-1",
    request: "Continue from the last error in this thread and fix it.",
    resumedFromJobId: "root-1",
  };

  const serialized = serializeJob(resumedJob, {
    getJobById(jobId) {
      return jobId === rootJob.id ? rootJob : null;
    },
  });

  assert.equal(serialized.request, resumedJob.request);
  assert.equal(serialized.displayRequest, rootJob.request);
});

test("serializeJobs resolves generated resume tasks against the current collection first", () => {
  const jobs = [
    {
      id: "root-1",
      chatId: "owner-1",
      request: "Resume the blocked apply_patch task",
      resumedFromJobId: null,
    },
    {
      id: "resume-1",
      chatId: "owner-1",
      request: "Continue from the last error in this thread and fix it.",
      resumedFromJobId: "root-1",
    },
  ];

  const serialized = serializeJobs(jobs);

  assert.equal(serialized[1]?.displayRequest, "Resume the blocked apply_patch task");
});
