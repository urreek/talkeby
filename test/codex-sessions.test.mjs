import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import {
  extractCodexSessionIdFromText,
  findNewTalkebySession,
  validateCodexSession,
} from "../src/services/codex-sessions.mjs";
import {
  createTalkebySessionFile,
  withTemporaryHome,
} from "./helpers/codex-test-utils.mjs";

test("extractCodexSessionIdFromText reads the native CLI session line", async () => {
  const sessionId = "11111111-2222-4333-8444-555555555555";
  assert.equal(
    extractCodexSessionIdFromText(`noise\nsession id: ${sessionId}\nmore noise`),
    sessionId,
  );
});

test("validateCodexSession rejects files that do not cover prior task history", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-session-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const sessionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  await withTemporaryHome(tempDir, async () => {
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["first task"],
    });

    const valid = await validateCodexSession({
      sessionId,
      workdir,
      minTaskMessages: 1,
    });
    assert.equal(valid.ok, true);

    const invalid = await validateCodexSession({
      sessionId,
      workdir,
      minTaskMessages: 2,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "insufficient_history");
  });
});

test("validateCodexSession accepts native codex_exec session files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-session-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const sessionId = "bbbbbbbb-1111-4ccc-8ddd-ffffffffffff";

  await withTemporaryHome(tempDir, async () => {
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["first task"],
      originator: "codex_exec",
    });

    const validation = await validateCodexSession({
      sessionId,
      workdir,
      minTaskMessages: 1,
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.session?.originator, "codex_exec");
  });
});

test("validateCodexSession accepts native codex desktop session files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-session-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const sessionId = "cccccccc-1111-4ccc-8ddd-aaaaaaaaaaaa";

  await withTemporaryHome(tempDir, async () => {
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["desktop thread"],
      originator: "codex desktop",
    });

    const validation = await validateCodexSession({
      sessionId,
      workdir,
      minTaskMessages: 1,
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.session?.originator, "codex desktop");
  });
});

test("validateCodexSession prefers the richest matching native session file", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-session-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const sessionId = "12345678-1234-4abc-8def-1234567890ab";

  await withTemporaryHome(tempDir, async () => {
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["older task"],
      createdAt: new Date(Date.now() - 5_000),
    });
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["first task", "second task"],
      createdAt: new Date(Date.now() - 1_000),
    });

    const validation = await validateCodexSession({
      sessionId,
      workdir,
      minTaskMessages: 2,
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.session?.taskMessageCount, 2);
  });
});

test("findNewTalkebySession returns native sessions created for the current workdir", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-session-"));
  const workdir = path.join(tempDir, "workdir");
  const otherWorkdir = path.join(tempDir, "other");
  await fs.mkdir(workdir, { recursive: true });
  await fs.mkdir(otherWorkdir, { recursive: true });
  const before = Date.now() - 1_000;

  await withTemporaryHome(tempDir, async () => {
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId: "00000000-1111-4222-8333-444444444444",
      workdir: otherWorkdir,
      taskMessages: ["other workdir"],
      createdAt: new Date(before + 100),
    });
    await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId: "99999999-8888-4777-8666-555555555555",
      workdir,
      taskMessages: ["matching workdir"],
      createdAt: new Date(before + 200),
      originator: "codex_exec",
    });

    const discovered = await findNewTalkebySession({
      afterMs: before,
      workdir,
    });
    assert.equal(discovered?.sessionId, "99999999-8888-4777-8666-555555555555");
  });
});
