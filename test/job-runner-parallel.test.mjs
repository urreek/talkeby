import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDatabase } from "../src/db/database.mjs";
import { TalkebyRepository } from "../src/db/repository.mjs";
import { EventBus } from "../src/services/event-bus.mjs";
import { JobRunner } from "../src/services/job-runner.mjs";
import { RuntimeState } from "../src/services/runtime-state.mjs";
import { setCodexSpawnCompatForTests } from "../src/runners/codex.mjs";

function buildConfig({ workdir, databaseFile }) {
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
    codex: {
      binary: process.execPath,
      workdir,
      projectsBaseDir: path.dirname(workdir),
      projects: new Map([[projectName, workdir]]),
      defaultProjectName: projectName,
      timeoutMs: 5000,
      model: "",
      parityMode: false,
      persistExtendedHistory: false,
      disableSessionResume: true,
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
        codex: process.execPath,
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
      enabled: false,
      autoApproveAll: false,
      fileChangeRequiresApproval: false,
    },
    debug: {
      logPromptPayload: false,
      logTokenUsage: false,
    },
  };
}

async function createHarness(tempDir) {
  const workdir = path.join(tempDir, "workdir");
  const databaseFile = path.join(tempDir, "data", "talkeby-test.db");
  await fs.mkdir(workdir, { recursive: true });
  const { db, sqlite } = createDatabase({ filePath: databaseFile });
  const repository = new TalkebyRepository(db);
  const state = new RuntimeState({
    config: buildConfig({ workdir, databaseFile }),
    repository,
  });
  state.hydrate();
  const eventBus = new EventBus(repository);
  const jobRunner = new JobRunner({
    config: buildConfig({ workdir, databaseFile }),
    state,
    eventBus,
    repository,
  });

  return {
    workdir,
    repository,
    state,
    jobRunner,
    sqlite,
  };
}

function createThread(repository, suffix) {
  return repository.createThread({
    id: `thread-${suffix}`,
    projectName: "demo",
    title: `Thread ${suffix}`,
    tokenBudget: 10000,
    autoTrimContext: true,
  });
}

function createQueuedJob({ state, threadId, request, workdir, offsetMs = 0 }) {
  const createdAt = new Date(Date.now() + offsetMs).toISOString();
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    status: "queued",
    createdAt,
    queuedAt: createdAt,
  });
}

function createParallelSpawnTracker(delayMs = 60) {
  const timeline = [];
  let active = 0;
  let maxActive = 0;

  return {
    timeline,
    getMaxActive() {
      return maxActive;
    },
    spawn(command, args) {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      const normalizedArgs = Array.isArray(args) ? args.map((value) => String(value)) : [];
      const stdinChunks = [];

      child.stdin = {
        write(chunk) {
          if (chunk !== undefined && chunk !== null) {
            stdinChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          }
          return true;
        },
        end(chunk) {
          if (chunk !== undefined && chunk !== null) {
            this.write(chunk);
          }
          const prompt = Buffer.concat(stdinChunks).toString("utf8");
          const outputIndex = normalizedArgs.indexOf("--output-last-message");
          const outputPath = outputIndex >= 0 ? normalizedArgs[outputIndex + 1] : "";
          const startTime = Date.now();
          active += 1;
          maxActive = Math.max(maxActive, active);
          timeline.push({ type: "start", prompt, time: startTime });

          setTimeout(() => {
            Promise.resolve()
              .then(async () => {
                if (outputPath) {
                  await fs.writeFile(outputPath, `done:${prompt.trim()}`);
                }
              })
              .finally(() => {
                timeline.push({ type: "end", prompt, time: Date.now() });
                active = Math.max(0, active - 1);
                child.emit("close", 0);
              });
          }, delayMs);
        },
      };

      return child;
    },
  };
}

function findEventTime(timeline, type, marker) {
  const match = timeline.find(
    (entry) => entry.type === type && entry.prompt.trim().endsWith(marker),
  );
  return match?.time || 0;
}

test("jobs from different threads run in parallel while same-thread jobs stay ordered", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-job-runner-parallel-"));
  const tracker = createParallelSpawnTracker();
  setCodexSpawnCompatForTests(tracker.spawn);

  const harness = await createHarness(tempDir);
  try {
    const { repository, state, jobRunner, workdir } = harness;
    const threadA = createThread(repository, "a");
    const threadB = createThread(repository, "b");

    const jobA1 = createQueuedJob({
      state,
      threadId: threadA.id,
      request: "THREAD_A_FIRST",
      workdir,
      offsetMs: -3_000,
    });
    const jobB1 = createQueuedJob({
      state,
      threadId: threadB.id,
      request: "THREAD_B_FIRST",
      workdir,
      offsetMs: -2_000,
    });
    const jobA2 = createQueuedJob({
      state,
      threadId: threadA.id,
      request: "THREAD_A_SECOND",
      workdir,
      offsetMs: -1_000,
    });

    jobRunner.enqueue(jobA1);
    jobRunner.enqueue(jobB1);
    jobRunner.enqueue(jobA2);
    await jobRunner.queue;

    assert.equal(repository.getJobById(jobA1.id)?.status, "completed");
    assert.equal(repository.getJobById(jobB1.id)?.status, "completed");
    assert.equal(repository.getJobById(jobA2.id)?.status, "completed");
    assert.equal(tracker.getMaxActive(), 2);

    const startA1 = findEventTime(tracker.timeline, "start", "THREAD_A_FIRST");
    const endA1 = findEventTime(tracker.timeline, "end", "THREAD_A_FIRST");
    const startB1 = findEventTime(tracker.timeline, "start", "THREAD_B_FIRST");
    const startA2 = findEventTime(tracker.timeline, "start", "THREAD_A_SECOND");

    assert.ok(startA1 > 0);
    assert.ok(endA1 > 0);
    assert.ok(startB1 > 0);
    assert.ok(startA2 > 0);
    assert.ok(startB1 < endA1);
    assert.ok(startA2 >= endA1);
  } finally {
    harness.sqlite.close();
    setCodexSpawnCompatForTests();
  }
});
