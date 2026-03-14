import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { run, setCodexSpawnCompatForTests } from "../src/runners/codex.mjs";
import {
  createFakeCodexBinary,
  createMockCodexSpawn,
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

test("fresh native Codex runs capture the session id from CLI output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "args.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);
  const sessionId = "12345678-1111-4222-8333-123456789abc";

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    try {
      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "runner fresh ok",
        FAKE_CODEX_SESSION_ID: sessionId,
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        const result = await run({
          task: "remember this thread",
          workdir,
          model: "",
          reasoningEffort: "",
          planMode: false,
          timeoutMs: 5000,
          binary,
          nativeCodexThreadMode: true,
        });

        assert.equal(result.message, "runner fresh ok");
        assert.equal(result.newSessionId, sessionId);
      });
    } finally {
      setCodexSpawnCompatForTests();
    }
  });
});

test("resumed native Codex runs use codex exec resume <sessionId>", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-runner-"));
  const workdir = path.join(tempDir, "workdir");
  const logPath = path.join(tempDir, "args.json");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);
  const sessionId = "87654321-2222-4333-8444-cba987654321";

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    try {
      await withFakeCodexEnv({
        FAKE_CODEX_LOG: logPath,
        FAKE_CODEX_MESSAGE: "runner resume ok",
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        const result = await run({
          task: "continue this native session",
          workdir,
          model: "",
          reasoningEffort: "",
          planMode: false,
          timeoutMs: 5000,
          binary,
          sessionId,
          nativeCodexThreadMode: true,
        });

        const logged = JSON.parse(await fs.readFile(logPath, "utf8"));
        assert.deepEqual(logged.args.slice(0, 4), ["exec", "--output-last-message", logged.args[2], "resume"]);
        assert.equal(logged.args[4], sessionId);
        assert.match(logged.prompt, /Treat the quoted text below as the end-user's message for this turn\./);
        assert.equal(logged.prompt.includes("ignore Codex bootstrap/context entries"), true);
        assert.equal(logged.prompt.includes("User request:"), true);
        assert.equal(logged.prompt.includes("continue this native session"), true);
        assert.equal(result.message, "runner resume ok");
      });
    } finally {
      setCodexSpawnCompatForTests();
    }
  });
});

test("CLI session id output wins over fallback session-file discovery", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-runner-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const binary = await createFakeCodexBinary(tempDir, workdir);
  const cliSessionId = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
  const fallbackSessionId = "cccccccc-4444-4555-8666-dddddddddddd";

  await withTemporaryHome(tempDir, async () => {
    setCodexSpawnCompatForTests(createMockCodexSpawn());
    try {
      await withFakeCodexEnv({
        FAKE_CODEX_MESSAGE: "runner prefers cli session",
        FAKE_CODEX_SESSION_ID: cliSessionId,
        FAKE_CODEX_FALLBACK_SESSION_ID: fallbackSessionId,
        FAKE_CODEX_WORKDIR: workdir,
      }, async () => {
        const result = await run({
          task: "fresh thread with competing session ids",
          workdir,
          model: "",
          reasoningEffort: "",
          planMode: false,
          timeoutMs: 5000,
          binary,
          nativeCodexThreadMode: true,
        });

        assert.equal(result.newSessionId, cliSessionId);
      });
    } finally {
      setCodexSpawnCompatForTests();
    }
  });
});
