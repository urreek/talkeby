import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDatabase } from "../src/db/database.mjs";
import { TalkebyRepository } from "../src/db/repository.mjs";
import { setCopilotSpawnCompatForTests } from "../src/runners/copilot.mjs";
import { EventBus } from "../src/services/event-bus.mjs";
import { JobRunner } from "../src/services/job-runner.mjs";
import { RuntimeState } from "../src/services/runtime-state.mjs";

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
      binary: "codex",
      workdir,
      projectsBaseDir: path.dirname(workdir),
      projects: new Map([[projectName, workdir]]),
      defaultProjectName: projectName,
      timeoutMs: 5000,
      model: "",
      parityMode: true,
      persistExtendedHistory: false,
      disableSessionResume: false,
    },
    threads: {
      defaultTokenBudget: 10000,
      autoTrimContextDefault: true,
    },
    runner: {
      provider: "copilot",
      model: "",
      timeoutMs: 5000,
      binaries: {
        codex: "codex",
        claude: "claude",
        gemini: "gemini",
        copilot: "copilot",
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
  const config = buildConfig({ workdir, databaseFile });
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
    config,
    workdir,
    repository,
    state,
    jobRunner,
    sqlite,
  };
}

function createThread(repository, title = "Thread") {
  return repository.createThread({
    id: `thread-${Math.random().toString(36).slice(2, 10)}`,
    projectName: "demo",
    title,
    tokenBudget: 10000,
    autoTrimContext: true,
  });
}

function createCompletedJob({
  state,
  threadId,
  request,
  summary,
  provider,
  workdir,
  offsetMs,
}) {
  const createdAt = new Date(Date.now() + offsetMs).toISOString();
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    provider,
    status: "completed",
    createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    summary,
  });
}

function createQueuedJob({
  state,
  threadId,
  request,
  provider,
  workdir,
  offsetMs,
}) {
  const createdAt = new Date(Date.now() + offsetMs).toISOString();
  return state.createJob({
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    chatId: state.getOwnerId(),
    threadId,
    request,
    projectName: "demo",
    workdir,
    provider,
    status: "queued",
    createdAt,
    queuedAt: createdAt,
  });
}

function promptFromArgs(args) {
  const promptIndex = args.indexOf("-p");
  return promptIndex >= 0 ? String(args[promptIndex + 1] || "") : "";
}

function createCopilotSpawnRecorder(records, { message = "copilot ok", sessionId = "" } = {}) {
  return (binary, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    records.push({
      binary,
      args: Array.isArray(args) ? args.map((value) => String(value)) : [],
    });

    setImmediate(() => {
      child.stdout.write(`${JSON.stringify({
        message,
        sessionId,
      })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 0);
    });

    return child;
  };
}

test("same-provider native Copilot turns resume without replaying Talkeby thread context", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-provider-switch-"));
  const records = [];
  setCopilotSpawnCompatForTests(createCopilotSpawnRecorder(records, {
    message: "copilot native resume ok",
    sessionId: "copilot-session-111111",
  }));

  const harness = await createHarness(tempDir);
  try {
    const { repository, state, jobRunner, workdir } = harness;
    state.setProvider("copilot");

    const thread = createThread(repository, "Copilot continuity");
    const firstJob = createCompletedJob({
      state,
      threadId: thread.id,
      request: "First copilot step",
      summary: "Completed the first copilot step.",
      provider: "copilot",
      workdir,
      offsetMs: -2_000,
    });
    repository.upsertThreadProviderSession({
      threadId: thread.id,
      provider: "copilot",
      sessionId: "copilot-session-111111",
      syncedJobId: firstJob.id,
    });
    const queuedJob = createQueuedJob({
      state,
      threadId: thread.id,
      request: "Continue with the next copilot step",
      provider: "copilot",
      workdir,
      offsetMs: -1_000,
    });

    jobRunner.enqueue(queuedJob);
    await jobRunner.queue;

    const prompt = promptFromArgs(records[0]?.args || []);
    assert.equal(records.length, 1);
    assert.equal(records[0].args.includes("--resume=copilot-session-111111"), true);
    assert.equal(prompt, "Continue with the next copilot step");
    assert.equal(prompt.includes("Switch context:"), false);
    assert.equal(prompt.includes("Thread context:"), false);
    assert.equal(prompt.includes("Bootstrap instructions:"), false);
    assert.equal(repository.getJobById(queuedJob.id)?.status, "completed");
    assert.equal(
      repository.getThreadProviderSession(thread.id, "copilot")?.syncedJobId,
      queuedJob.id,
    );
  } finally {
    harness.sqlite.close();
    setCopilotSpawnCompatForTests();
  }
});

test("switching from Codex to Copilot injects a compact handoff instead of full thread replay", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-provider-switch-"));
  const records = [];
  setCopilotSpawnCompatForTests(createCopilotSpawnRecorder(records, {
    message: "copilot switched ok",
    sessionId: "copilot-session-222222",
  }));

  const harness = await createHarness(tempDir);
  try {
    const { repository, state, jobRunner, workdir } = harness;
    state.setProvider("copilot");

    const thread = createThread(repository, "Provider switch");
    createCompletedJob({
      state,
      threadId: thread.id,
      request: "Plan the auth flow",
      summary: "Outlined the auth flow and saved the decisions.",
      provider: "codex",
      workdir,
      offsetMs: -3_000,
    });
    createCompletedJob({
      state,
      threadId: thread.id,
      request: "Add the login route",
      summary: "Added the login route and connected the page shell.",
      provider: "codex",
      workdir,
      offsetMs: -2_000,
    });
    const queuedJob = createQueuedJob({
      state,
      threadId: thread.id,
      request: "Continue from here with Copilot",
      provider: "copilot",
      workdir,
      offsetMs: -1_000,
    });

    jobRunner.enqueue(queuedJob);
    await jobRunner.queue;

    const prompt = promptFromArgs(records[0]?.args || []);
    assert.equal(records.length, 1);
    assert.equal(prompt.includes("Bootstrap instructions:"), true);
    assert.equal(prompt.includes("Switch context: Codex -> GitHub Copilot."), true);
    assert.equal(prompt.includes("Plan the auth flow"), true);
    assert.equal(prompt.includes("Add the login route"), true);
    assert.equal(prompt.includes("Thread context:"), false);
    assert.equal(prompt.trim().endsWith("Continue from here with Copilot"), true);
    assert.equal(
      repository.getThreadProviderSession(thread.id, "copilot")?.sessionId,
      "copilot-session-222222",
    );
  } finally {
    harness.sqlite.close();
    setCopilotSpawnCompatForTests();
  }
});

test("switching back to Copilot only replays the unseen delta after its last synced job", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-provider-switch-"));
  const records = [];
  setCopilotSpawnCompatForTests(createCopilotSpawnRecorder(records, {
    message: "copilot delta resume ok",
    sessionId: "",
  }));

  const harness = await createHarness(tempDir);
  try {
    const { repository, state, jobRunner, workdir } = harness;
    state.setProvider("copilot");

    const thread = createThread(repository, "Switch back");
    const originalCopilotJob = createCompletedJob({
      state,
      threadId: thread.id,
      request: "Original copilot plan",
      summary: "Created the original copilot plan.",
      provider: "copilot",
      workdir,
      offsetMs: -4_000,
    });
    repository.upsertThreadProviderSession({
      threadId: thread.id,
      provider: "copilot",
      sessionId: "copilot-session-333333",
      syncedJobId: originalCopilotJob.id,
    });
    createCompletedJob({
      state,
      threadId: thread.id,
      request: "Codex follow-up one",
      summary: "Implemented the first follow-up change.",
      provider: "codex",
      workdir,
      offsetMs: -3_000,
    });
    createCompletedJob({
      state,
      threadId: thread.id,
      request: "Codex follow-up two",
      summary: "Implemented the second follow-up change.",
      provider: "codex",
      workdir,
      offsetMs: -2_000,
    });
    const queuedJob = createQueuedJob({
      state,
      threadId: thread.id,
      request: "Pick up the Copilot session again",
      provider: "copilot",
      workdir,
      offsetMs: -1_000,
    });

    jobRunner.enqueue(queuedJob);
    await jobRunner.queue;

    const prompt = promptFromArgs(records[0]?.args || []);
    assert.equal(records.length, 1);
    assert.equal(records[0].args.includes("--resume=copilot-session-333333"), true);
    assert.equal(prompt.includes("Switch context: Codex -> GitHub Copilot."), true);
    assert.equal(prompt.includes("Codex follow-up one"), true);
    assert.equal(prompt.includes("Codex follow-up two"), true);
    assert.equal(prompt.includes("Original copilot plan"), false);
    assert.equal(prompt.trim().endsWith("Pick up the Copilot session again"), true);
    assert.equal(
      repository.getThreadProviderSession(thread.id, "copilot")?.syncedJobId,
      queuedJob.id,
    );
  } finally {
    harness.sqlite.close();
    setCopilotSpawnCompatForTests();
  }
});
