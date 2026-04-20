import test from "node:test";
import assert from "node:assert/strict";

import { buildThreadMemoryInspector } from "../src/services/thread-memory-inspector.mjs";

function repositoryStub({
  thread,
  jobs = [],
  sessions = [],
}) {
  const sessionsByKey = new Map(
    sessions.map((session) => [`${session.threadId}:${session.provider}`, session]),
  );

  return {
    getThread(threadId) {
      return thread?.id === threadId ? thread : null;
    },
    listJobsByThread(threadId) {
      return thread?.id === threadId ? jobs : [];
    },
    getThreadProviderSession(threadId, provider) {
      return sessionsByKey.get(`${threadId}:${provider}`) || null;
    },
  };
}

function baseThread(patch = {}) {
  return {
    id: "thread-1",
    projectName: "demo",
    title: "Thread",
    status: "active",
    lastProvider: "",
    lastModel: "",
    tokenBudget: 1000,
    tokenUsed: 250,
    autoTrimContext: 1,
    createdAt: "2026-04-19T10:00:00.000Z",
    updatedAt: "2026-04-19T10:00:00.000Z",
    ...patch,
  };
}

function completedJob(patch = {}) {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    threadId: "thread-1",
    provider: "codex",
    status: "completed",
    startedAt: "2026-04-19T10:00:00.000Z",
    completedAt: "2026-04-19T10:01:00.000Z",
    ...patch,
  };
}

test("thread memory inspector reports native resume when the active provider has a session", () => {
  const repository = repositoryStub({
    thread: baseThread({ lastProvider: "copilot" }),
    jobs: [
      completedJob({ provider: "copilot" }),
    ],
    sessions: [
      {
        threadId: "thread-1",
        provider: "copilot",
        sessionId: "copilot-session-1",
        syncedJobId: "job-1",
        updatedAt: "2026-04-19T10:02:00.000Z",
      },
    ],
  });

  const memory = buildThreadMemoryInspector({
    repository,
    threadId: "thread-1",
    activeProvider: "copilot",
    activeModel: "",
    workspacePath: "C:/work/demo",
  });

  assert.equal(memory.context.mode, "native_resume");
  assert.equal(memory.currentProvider.label, "GitHub Copilot");
  assert.equal(memory.nativeSessions.find((session) => session.provider === "copilot")?.hasSession, true);
  assert.equal(memory.workspacePath, "C:/work/demo");
});

test("thread memory inspector reports clean native start instead of provider handoff", () => {
  const repository = repositoryStub({
    thread: baseThread({ lastProvider: "codex" }),
    jobs: [
      completedJob({ provider: "codex" }),
    ],
  });

  const memory = buildThreadMemoryInspector({
    repository,
    threadId: "thread-1",
    activeProvider: "copilot",
  });

  assert.equal(memory.context.mode, "clean_native_start");
  assert.equal(memory.latestJobProvider?.label, "Codex");
});

test("thread memory inspector reports clean native start for same-provider history without a session", () => {
  const repository = repositoryStub({
    thread: baseThread({ lastProvider: "copilot" }),
    jobs: [
      completedJob({ provider: "copilot", status: "failed" }),
    ],
  });

  const memory = buildThreadMemoryInspector({
    repository,
    threadId: "thread-1",
    activeProvider: "copilot",
  });

  assert.equal(memory.context.mode, "clean_native_start");
});
