import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import Database from "better-sqlite3";

import { createDatabase } from "../src/db/database.mjs";
import { TalkebyRepository } from "../src/db/repository.mjs";
import { bootstrapCodexAppRegistry, readCodexSessionIndexEntries } from "../src/services/codex-app-registry.mjs";
import { CodexThreadSync } from "../src/services/codex-thread-sync.mjs";
import { createTalkebySessionFile, withTemporaryHome } from "./helpers/codex-test-utils.mjs";

function buildConfig(workdir) {
  return {
    codex: {
      projects: new Map([["demo", workdir]]),
    },
    threads: {
      defaultTokenBudget: 10000,
      autoTrimContextDefault: true,
    },
  };
}

async function createHarness(tempDir, workdir) {
  const databaseFile = path.join(tempDir, "data", "talkeby.db");
  await fs.mkdir(path.dirname(databaseFile), { recursive: true });
  const { db, sqlite } = createDatabase({ filePath: databaseFile });
  return {
    repository: new TalkebyRepository(db),
    sqlite,
    config: buildConfig(workdir),
  };
}

async function seedCodexRegistry(codexHomeDir) {
  await fs.mkdir(codexHomeDir, { recursive: true });
  const statePath = path.join(codexHomeDir, "state_5.sqlite");
  const sqlite = new Database(statePath);
  bootstrapCodexAppRegistry(sqlite);
  return sqlite;
}

test("CodexThreadSync exports Talkeby session-backed threads to the Codex app registry", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-sync-"));
  const workdir = path.join(tempDir, "workdir");
  const codexHomeDir = path.join(tempDir, ".codex");
  await fs.mkdir(workdir, { recursive: true });

  const sqlite = await seedCodexRegistry(codexHomeDir);
  sqlite.close();

  const sessionId = "11111111-2222-4333-8444-555555555555";
  await createTalkebySessionFile({
    homeDir: tempDir,
    sessionId,
    workdir,
    taskMessages: ["Build the sync layer"],
    originator: "codex_exec",
  });

  await withTemporaryHome(tempDir, async () => {
    const harness = await createHarness(tempDir, workdir);
    try {
      const thread = harness.repository.createThread({
        id: "talkeby-thread-1",
        projectName: "demo",
        title: "Build the sync layer",
        cliSessionId: sessionId,
        createdAt: "2026-03-16T10:00:00.000Z",
        updatedAt: "2026-03-16T10:05:00.000Z",
      });

      const sync = new CodexThreadSync({
        config: harness.config,
        repository: harness.repository,
        codexHomeDir,
        throttleMs: 0,
      });
      await sync.syncTalkebyThread(thread.id);

      const stateDb = new Database(path.join(codexHomeDir, "state_5.sqlite"), { readonly: true });
      try {
        const row = stateDb.prepare("SELECT * FROM threads WHERE id = ?").get(sessionId);
        assert.equal(row?.title, "Build the sync layer");
        assert.equal(row?.rollout_path.includes(sessionId), true);
        assert.equal(row?.first_user_message, "Build the sync layer");
      } finally {
        stateDb.close();
      }

      const indexEntries = readCodexSessionIndexEntries({ codexHomeDir });
      assert.equal(indexEntries.some((entry) => entry.id === sessionId && entry.thread_name === "Build the sync layer"), true);
    } finally {
      harness.sqlite.close();
    }
  });
});

test("CodexThreadSync imports matching Codex desktop threads into Talkeby", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-sync-"));
  const workdir = path.join(tempDir, "workdir");
  const codexHomeDir = path.join(tempDir, ".codex");
  await fs.mkdir(workdir, { recursive: true });

  const sessionId = "99999999-8888-4777-8666-555555555555";
  const createdAt = new Date("2026-03-16T12:00:00.000Z");
  await createTalkebySessionFile({
    homeDir: tempDir,
    sessionId,
    workdir,
    taskMessages: ["Desktop prompt"],
    originator: "codex desktop",
    createdAt,
  });

  const sqlite = await seedCodexRegistry(codexHomeDir);
  try {
    sqlite.prepare(`
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
        git_sha, git_branch, git_origin_url, cli_version, first_user_message, memory_mode
      ) VALUES (
        @id, @rollout_path, @created_at, @updated_at, @source, @model_provider, @cwd, @title,
        @sandbox_policy, @approval_mode, @tokens_used, @has_user_event, @archived, @archived_at,
        @git_sha, @git_branch, @git_origin_url, @cli_version, @first_user_message, @memory_mode
      )
    `).run({
      id: sessionId,
      rollout_path: path.join(codexHomeDir, "sessions", "2026", "03", "16", `rollout-${sessionId}.jsonl`),
      created_at: Math.floor(createdAt.getTime() / 1000),
      updated_at: Math.floor(createdAt.getTime() / 1000) + 5,
      source: "vscode",
      model_provider: "openai",
      cwd: process.platform === "win32" ? `\\\\?\\${workdir}` : workdir,
      title: "Desktop imported thread",
      sandbox_policy: "{\"type\":\"workspace-write\",\"writable_roots\":[],\"network_access\":false}",
      approval_mode: "on-request",
      tokens_used: 0,
      has_user_event: 0,
      archived: 0,
      archived_at: null,
      git_sha: null,
      git_branch: null,
      git_origin_url: null,
      cli_version: "0.104.0",
      first_user_message: "Desktop imported thread",
      memory_mode: "enabled",
    });
  } finally {
    sqlite.close();
  }

  await withTemporaryHome(tempDir, async () => {
    const harness = await createHarness(tempDir, workdir);
    try {
      const sync = new CodexThreadSync({
        config: harness.config,
        repository: harness.repository,
        codexHomeDir,
        throttleMs: 0,
      });
      await sync.ensureSynced({ force: true });

      const imported = harness.repository.getThreadByCliSessionId(sessionId);
      assert.equal(imported?.title, "Desktop imported thread");
      assert.equal(imported?.projectName, "demo");
      assert.equal(imported?.cliSessionId, sessionId);
    } finally {
      harness.sqlite.close();
    }
  });
});

test("CodexThreadSync archives matching Talkeby threads when the Codex app thread is archived", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-sync-"));
  const workdir = path.join(tempDir, "workdir");
  const codexHomeDir = path.join(tempDir, ".codex");
  await fs.mkdir(workdir, { recursive: true });

  const sessionId = "45454545-8888-4777-8666-555555555555";
  const createdAt = new Date("2026-03-16T12:00:00.000Z");
  await createTalkebySessionFile({
    homeDir: tempDir,
    sessionId,
    workdir,
    taskMessages: ["Desktop prompt"],
    originator: "codex desktop",
    createdAt,
  });

  const sqlite = await seedCodexRegistry(codexHomeDir);
  try {
    sqlite.prepare(`
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
        git_sha, git_branch, git_origin_url, cli_version, first_user_message, memory_mode
      ) VALUES (
        @id, @rollout_path, @created_at, @updated_at, @source, @model_provider, @cwd, @title,
        @sandbox_policy, @approval_mode, @tokens_used, @has_user_event, @archived, @archived_at,
        @git_sha, @git_branch, @git_origin_url, @cli_version, @first_user_message, @memory_mode
      )
    `).run({
      id: sessionId,
      rollout_path: path.join(codexHomeDir, "sessions", "2026", "03", "16", `rollout-${sessionId}.jsonl`),
      created_at: Math.floor(createdAt.getTime() / 1000),
      updated_at: Math.floor(createdAt.getTime() / 1000) + 5,
      source: "vscode",
      model_provider: "openai",
      cwd: process.platform === "win32" ? `\\\\?\\${workdir}` : workdir,
      title: "Archived desktop thread",
      sandbox_policy: "{\"type\":\"workspace-write\",\"writable_roots\":[],\"network_access\":false}",
      approval_mode: "on-request",
      tokens_used: 0,
      has_user_event: 0,
      archived: 1,
      archived_at: Math.floor(createdAt.getTime() / 1000) + 10,
      git_sha: null,
      git_branch: null,
      git_origin_url: null,
      cli_version: "0.104.0",
      first_user_message: "Archived desktop thread",
      memory_mode: "enabled",
    });
  } finally {
    sqlite.close();
  }

  await withTemporaryHome(tempDir, async () => {
    const harness = await createHarness(tempDir, workdir);
    try {
      harness.repository.createThread({
        id: "talkeby-thread-archived",
        projectName: "demo",
        title: "Archived desktop thread",
        cliSessionId: sessionId,
      });

      const sync = new CodexThreadSync({
        config: harness.config,
        repository: harness.repository,
        codexHomeDir,
        throttleMs: 0,
      });
      await sync.ensureSynced({ force: true });

      const archived = harness.repository.getThreadByCliSessionId(sessionId);
      assert.equal(archived?.status, "archived");
      assert.equal(harness.repository.listRecentThreads(50).some((thread) => thread.id === archived?.id), false);
    } finally {
      harness.sqlite.close();
    }
  });
});

test("CodexThreadSync archiveTalkebyThread archives the Codex app thread and removes it from the session index", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-sync-"));
  const workdir = path.join(tempDir, "workdir");
  const codexHomeDir = path.join(tempDir, ".codex");
  await fs.mkdir(workdir, { recursive: true });

  const sessionId = "56565656-9999-4777-8666-555555555555";
  const createdAt = new Date("2026-03-16T12:00:00.000Z");
  await createTalkebySessionFile({
    homeDir: tempDir,
    sessionId,
    workdir,
    taskMessages: ["Archive me"],
    originator: "codex_exec",
    createdAt,
  });

  const sqlite = await seedCodexRegistry(codexHomeDir);
  try {
    sqlite.prepare(`
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
        git_sha, git_branch, git_origin_url, cli_version, first_user_message, memory_mode
      ) VALUES (
        @id, @rollout_path, @created_at, @updated_at, @source, @model_provider, @cwd, @title,
        @sandbox_policy, @approval_mode, @tokens_used, @has_user_event, @archived, @archived_at,
        @git_sha, @git_branch, @git_origin_url, @cli_version, @first_user_message, @memory_mode
      )
    `).run({
      id: sessionId,
      rollout_path: path.join(codexHomeDir, "sessions", "2026", "03", "16", `rollout-${sessionId}.jsonl`),
      created_at: Math.floor(createdAt.getTime() / 1000),
      updated_at: Math.floor(createdAt.getTime() / 1000) + 5,
      source: "vscode",
      model_provider: "openai",
      cwd: process.platform === "win32" ? `\\\\?\\${workdir}` : workdir,
      title: "Archive me",
      sandbox_policy: "{\"type\":\"workspace-write\",\"writable_roots\":[],\"network_access\":false}",
      approval_mode: "on-request",
      tokens_used: 0,
      has_user_event: 0,
      archived: 0,
      archived_at: null,
      git_sha: null,
      git_branch: null,
      git_origin_url: null,
      cli_version: "0.104.0",
      first_user_message: "Archive me",
      memory_mode: "enabled",
    });
  } finally {
    sqlite.close();
  }

  await withTemporaryHome(tempDir, async () => {
    const harness = await createHarness(tempDir, workdir);
    try {
      const thread = harness.repository.createThread({
        id: "talkeby-thread-delete",
        projectName: "demo",
        title: "Archive me",
        cliSessionId: sessionId,
      });

      const sync = new CodexThreadSync({
        config: harness.config,
        repository: harness.repository,
        codexHomeDir,
        throttleMs: 0,
      });
      await sync.syncTalkebyThread(thread.id);
      await sync.archiveTalkebyThread(thread);

      const stateDb = new Database(path.join(codexHomeDir, "state_5.sqlite"), { readonly: true });
      try {
        const row = stateDb.prepare("SELECT archived, archived_at FROM threads WHERE id = ?").get(sessionId);
        assert.equal(row?.archived, 1);
        assert.equal(Number(row?.archived_at || 0) > 0, true);
      } finally {
        stateDb.close();
      }

      const indexEntries = readCodexSessionIndexEntries({ codexHomeDir });
      assert.equal(indexEntries.some((entry) => entry.id === sessionId), false);
    } finally {
      harness.sqlite.close();
    }
  });
});
