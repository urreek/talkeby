import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { createDatabase } from "../src/db/database.mjs";
import { TalkebyRepository } from "../src/db/repository.mjs";
import { setCodexSpawnCompatForTests } from "../src/runners/codex.mjs";
import { EventBus } from "../src/services/event-bus.mjs";
import { JobRunner } from "../src/services/job-runner.mjs";
import { RuntimeState } from "../src/services/runtime-state.mjs";
import {
  createFakeCodexBinary,
  createMockCodexSpawn,
  createTalkebySessionFile,
  withTemporaryHome,
} from "./helpers/codex-test-utils.mjs";


async function withFakeCodexEnv(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function buildTestConfig({
  workdir,
  databaseFile,
  binary,
  runtimePolicyEnabled = false,
  autoApproveAll = false,
  disableSessionResume = false,
}) {
  const projectName = "demo";
  return {
    port: 3000,
    storage: {
      dataDir: path.dirname(databaseFile),
      databaseFile,
    },
    app: {
      defaultExecutionMode: "auto",
      progressUpdates: false,
      progressUpdateSeconds: 60,
    },
    workspace: {
      workdir,
      projectsBaseDir: workdir,
      projects: new Map([[projectName, workdir]]),
      defaultProjectName: projectName,
    },
    codex: {
      binary,
      workdir,
      projectsBaseDir: path.dirname(workdir),
      projects: new Map([[projectName, workdir]]),
      defaultProjectName: projectName,
      timeoutMs: 5000,
      model: "",
      parityMode: true,
      persistExtendedHistory: true,
      disableSessionResume,
    },
    threads: {
      defaultTokenBudget: 10000,
      autoTrimContextDefault: true,
    },
    runner: {
      provider: "codex",
      model: "",
      timeoutMs: 5000,
      binaries: {
        codex: binary,
        claude: "claude",
        gemini: "gemini",
        groq: "aider",
        openrouter: "aider",
        aider: "aider",
      },
      freeModelsOnly: false,
    },
    providers: {
      discoverModels: false,
    },
    security: {
      rateLimitPerMinute: 240,
      ownerKey: "",
      sessionCookieName: "talkeby_session",
      csrfSecret: "test-secret",
      csrfTtlMs: 60_000,
      sessionTtlMs: 60_000,
    },
    runtimePolicy: {
      enabled: runtimePolicyEnabled,
      autoApproveAll,
      fileChangeRequiresApproval: false,
    },
    debug: {
      logPromptPayload: false,
      logTokenUsage: false,
    },
  };
}

function buildJobTimestamps(offsetMs) {
  const createdAt = new Date(Date.now() + offsetMs).toISOString();
  return {
    createdAt,
    queuedAt: createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
  };
}

async function createHarness({
  tempDir,
  workdir,
  binary,
  runtimePolicyEnabled = false,
  autoApproveAll = false,
  disableSessionResume = false,
}) {
  const databaseFile = path.join(tempDir, "data", "talkeby-test.db");
  const { db, sqlite } = createDatabase({ filePath: databaseFile });
  const repository = new TalkebyRepository(db);
  const config = buildTestConfig({
    workdir,
    databaseFile,
    binary,
    runtimePolicyEnabled,
    autoApproveAll,
    disableSessionResume,
  });
  const state = new RuntimeState({
    config,
    repository,
  });
  state.hydrate();
  const eventBus = new EventBus(repository);
  const jobRunner = new JobRunner({
    config,
    state,
    eventBus,
    repository,
  });

  return {
    repository,
    state,
    jobRunner,
    sqlite,
  };
}

function createThread(repository) {
  return repository.createThread({
    id: `thread-${Math.random().toString(36).slice(2, 10)}`,
    projectName: "demo",
    title: "Native memory thread",
    tokenBudget: 10000,
    autoTrimContext: true,
  });
}

function createCompletedJob({ state, threadId, request, workdir, offsetMs }) {
  const timestamps = buildJobTimestamps(offsetMs);
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    status: "completed",
    createdAt: timestamps.createdAt,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    summary: `reply:${request}`,
  });
}

function createFailedJob({ state, threadId, request, workdir, offsetMs, error = "preflight failed" }) {
  const timestamps = buildJobTimestamps(offsetMs);
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    status: "failed",
    createdAt: timestamps.createdAt,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    error,
  });
}

function createQueuedJob({ state, threadId, request, workdir, offsetMs }) {
  const timestamps = buildJobTimestamps(offsetMs);
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    status: "queued",
    createdAt: timestamps.createdAt,
    queuedAt: timestamps.queuedAt,
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("native Codex parity resumes validated sessions without injecting managed thread context", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-job-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "resume-log.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);
  const sessionId = "99999999-1111-4222-8333-aaaaaaaaaaaa";

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    const harness = await createHarness({
      tempDir,
      workdir,
      binary,
      runtimePolicyEnabled: false,
    });

    try {
      const { repository, state, jobRunner } = harness;
      const thread = createThread(repository);
      repository.updateThread(thread.id, { cliSessionId: sessionId });
      await createTalkebySessionFile({
        homeDir: tempDir,
        sessionId,
        workdir,
        taskMessages: ["first task"],
      });
      createCompletedJob({
        state,
        threadId: thread.id,
        request: "first task",
        workdir,
        offsetMs: -2_000,
      });
      const queuedJob = createQueuedJob({
        state,
        threadId: thread.id,
        request: "what was my first message",
        workdir,
        offsetMs: -1_000,
      });

      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "native resume ok",
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        jobRunner.enqueue(queuedJob);
        await jobRunner.queue;
      });

      const updatedJob = repository.getJobById(queuedJob.id);
      const logged = JSON.parse(await fs.readFile(logPath, "utf8"));
      assert.equal(updatedJob?.status, "completed");
      assert.equal(updatedJob?.summary, "native resume ok");
      assert.equal(logged.args[0], "exec");
      const resumeIndex = logged.args.indexOf("resume");
      const sessionIdIndex = logged.args.indexOf(sessionId);
      assert.notEqual(resumeIndex, -1);
      assert.notEqual(sessionIdIndex, -1);
      assert.ok(sessionIdIndex > resumeIndex);
      assert.equal(logged.args.at(-1), "-");
      assert.equal(logged.prompt, `${queuedJob.request}\n`);
      assert.equal(logged.prompt.includes("Thread context:"), false);
      assert.equal(logged.prompt.includes("Previous error context:"), false);
      assert.equal(repository.getThread(thread.id)?.cliSessionId, sessionId);
    } finally {
      harness.sqlite.close();
      setCodexSpawnCompatForTests();
    }
  });
});

test("native Codex parity ignores failed preflight jobs when validating native session history", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-job-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "resume-after-failures-log.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);
  const sessionId = "77777777-1111-4222-8333-bbbbbbbbbbbb";

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    const harness = await createHarness({
      tempDir,
      workdir,
      binary,
      runtimePolicyEnabled: false,
    });

    try {
      const { repository, state, jobRunner } = harness;
      const thread = createThread(repository);
      repository.updateThread(thread.id, { cliSessionId: sessionId });
      await createTalkebySessionFile({
        homeDir: tempDir,
        sessionId,
        workdir,
        taskMessages: ["first task"],
      });
      createCompletedJob({
        state,
        threadId: thread.id,
        request: "first task",
        workdir,
        offsetMs: -4_000,
      });
      createFailedJob({
        state,
        threadId: thread.id,
        request: "retry after restart",
        workdir,
        offsetMs: -3_000,
        error: "Talkeby restarted while this job was running.",
      });
      createFailedJob({
        state,
        threadId: thread.id,
        request: "retry after bad flag",
        workdir,
        offsetMs: -2_000,
        error: "error: unexpected argument '--reasoning-effort' found",
      });
      const queuedJob = createQueuedJob({
        state,
        threadId: thread.id,
        request: "continue from the last error in this thread and fix it.",
        workdir,
        offsetMs: -1_000,
      });

      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "native resume after failures ok",
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        jobRunner.enqueue(queuedJob);
        await jobRunner.queue;
      });

      const updatedJob = repository.getJobById(queuedJob.id);
      const logged = JSON.parse(await fs.readFile(logPath, "utf8"));
      assert.equal(updatedJob?.status, "completed");
      assert.equal(updatedJob?.summary, "native resume after failures ok");
      const resumeIndex = logged.args.indexOf("resume");
      const sessionIdIndex = logged.args.indexOf(sessionId);
      assert.notEqual(resumeIndex, -1);
      assert.notEqual(sessionIdIndex, -1);
      assert.ok(sessionIdIndex > resumeIndex);
    } finally {
      harness.sqlite.close();
      setCodexSpawnCompatForTests();
    }
  });
});

test("native Codex parity fails loudly when prior thread history has no valid native session", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-job-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "invalid-session-log.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    const harness = await createHarness({
      tempDir,
      workdir,
      binary,
      runtimePolicyEnabled: false,
    });

    try {
      const { repository, state, jobRunner } = harness;
      const thread = createThread(repository);
      createCompletedJob({
        state,
        threadId: thread.id,
        request: "first task",
        workdir,
        offsetMs: -2_000,
      });
      const queuedJob = createQueuedJob({
        state,
        threadId: thread.id,
        request: "remember the whole thread",
        workdir,
        offsetMs: -1_000,
      });

      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "should not run",
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        jobRunner.enqueue(queuedJob);
        await jobRunner.queue;
      });

      const updatedJob = repository.getJobById(queuedJob.id);
      const events = repository.listEventsForJob({ jobId: queuedJob.id });
      const continuityEvent = events.find((event) => event.eventType === "thread_continuity_error");

      assert.equal(updatedJob?.status, "failed");
      assert.match(
        String(updatedJob?.error || ""),
        /has prior Codex history but no valid native Codex session to resume/i,
      );
      assert.equal(await fileExists(logPath), false);
      assert.ok(continuityEvent);
      assert.equal(continuityEvent?.payload?.reason, "missing_session_id");
    } finally {
      harness.sqlite.close();
      setCodexSpawnCompatForTests();
    }
  });
});

test("native Codex parity rejects Talkeby runtime policy interception before execution starts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-job-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "runtime-policy-log.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    const harness = await createHarness({
      tempDir,
      workdir,
      binary,
      runtimePolicyEnabled: true,
      autoApproveAll: false,
    });

    try {
      const { repository, state, jobRunner } = harness;
      const thread = createThread(repository);
      const queuedJob = createQueuedJob({
        state,
        threadId: thread.id,
        request: "continue our thread safely",
        workdir,
        offsetMs: -1_000,
      });

      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "should not run",
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        jobRunner.enqueue(queuedJob);
        await jobRunner.queue;
      });

      const updatedJob = repository.getJobById(queuedJob.id);
      const events = repository.listEventsForJob({ jobId: queuedJob.id });
      const continuityEvent = events.find((event) => event.eventType === "thread_continuity_error");

      assert.equal(updatedJob?.status, "failed");
      assert.match(
        String(updatedJob?.error || ""),
        /incompatible with Talkeby runtime policy interception/i,
      );
      assert.equal(await fileExists(logPath), false);
      assert.ok(continuityEvent);
      assert.equal(continuityEvent?.payload?.reason, "runtime_policy_interception");
    } finally {
      harness.sqlite.close();
      setCodexSpawnCompatForTests();
    }
  });
});

