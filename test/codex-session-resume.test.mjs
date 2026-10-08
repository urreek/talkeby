import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { resumeCodexSession } from "../src/services/codex-session-resume.mjs";

const sessionId = "11111111-2222-4333-8444-555555555555";
const forkId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const conflict = new Error(`thread-store conflict: thread ${sessionId} already has an active writer`);

test("resume preserves the existing session id when CLI output omits it", async () => {
  const result = await resumeCodexSession({
    config: { sessionId },
    buildArgs: (command) => [command],
    execute: async (args) => {
      assert.deepEqual(args, ["resume"]);
      return { message: "continued", nativeSessionId: "" };
    },
  });
  assert.equal(result.newSessionId, sessionId);
});

test("active writer conflict forks saved history and returns the fork id", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-resume-"));
  const outputPath = path.join(tempDir, "output.txt");
  const calls = [];
  const lines = [];
  try {
    await fs.writeFile(outputPath, "stale output");
    const result = await resumeCodexSession({
      config: { sessionId, onLine: (line) => lines.push(line) },
      outputPath,
      buildArgs: (command) => [command, sessionId],
      execute: async (args) => {
        calls.push(args);
        if (args[0] === "resume") throw conflict;
        await assert.rejects(fs.readFile(outputPath), { code: "ENOENT" });
        return { message: "continued from history", nativeSessionId: forkId };
      },
    });
    assert.deepEqual(calls, [["resume", sessionId], ["fork", sessionId]]);
    assert.equal(result.newSessionId, forkId);
    assert.match(lines[0], /fork of its saved history/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

for (const error of [new Error("authentication failed"), new Error("Codex execution timed out."), new Error("Run cancelled by user.")]) {
  test(`resume failure does not retry: ${error.message}`, async () => {
    let attempts = 0;
    await assert.rejects(resumeCodexSession({
      config: { sessionId },
      buildArgs: (command) => [command],
      execute: async () => { attempts += 1; throw error; },
    }), (actual) => actual === error);
    assert.equal(attempts, 1);
  });
}

test("cancelled writer conflict does not fork", async () => {
  await assert.rejects(resumeCodexSession({
    config: { sessionId, signal: AbortSignal.abort() },
    buildArgs: (command) => [command],
    execute: async () => { throw conflict; },
  }), (actual) => actual === conflict);
});

for (const nativeSessionId of ["", sessionId]) {
  test(`fork refuses an invalid continuation id: ${nativeSessionId || "missing"}`, async () => {
    await assert.rejects(resumeCodexSession({
      config: { sessionId },
      outputPath: path.join(os.tmpdir(), `talkeby-missing-${forkId}.txt`),
      buildArgs: (command) => [command],
      execute: async ([command]) => {
        if (command === "resume") throw conflict;
        return { message: "continued", nativeSessionId };
      },
    }), /fork did not return a new session id/);
  });
}
