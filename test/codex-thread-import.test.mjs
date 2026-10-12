import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import Database from "better-sqlite3";
import { createDatabase } from "../src/db/database.mjs";
import { TalkebyRepository } from "../src/db/repository.mjs";
import { CodexThreadSync } from "../src/services/codex-thread-sync.mjs";
import { bootstrapCodexAppRegistry, upsertCodexAppThread } from "../src/services/codex-app-registry.mjs";
import { createTalkebySessionFile, withTemporaryHome } from "./helpers/codex-test-utils.mjs";

const sessionId = "11111111-2222-4333-8444-555555555555";
const nextSessionId = "66666666-7777-4888-8999-000000000000";

async function withImportFixture(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-thread-import-"));
  const codexHomeDir = path.join(directory, ".codex");
  const rollout = await createTalkebySessionFile({ homeDir: directory, sessionId, workdir: directory, taskMessages: ["Native history"] });
  const registry = new Database(path.join(codexHomeDir, "state_5.sqlite"));
  bootstrapCodexAppRegistry(registry);
  registry.close();
  upsertCodexAppThread({ codexHomeDir, thread: {
    id: sessionId, cwd: directory, rollout_path: rollout, title: "Native conversation", source: "vscode",
    created_at: 1_700_000_000, updated_at: 1_700_000_001,
  } });
  const { db, sqlite } = createDatabase({ filePath: path.join(directory, "talkeby.db") });
  const repository = new TalkebyRepository(db);
  const config = { workspace: { projects: new Map([["demo", directory]]) } };
  const sync = new CodexThreadSync({ repository, config, codexHomeDir });
  try {
    await withTemporaryHome(directory, () => callback({ repository, sqlite, sync, directory, config, codexHomeDir }));
  } finally {
    sqlite.close();
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith("talkeby-thread-import-")) throw new Error("Invalid fixture path");
    await fs.rm(directory, { recursive: true, force: true });
  }
}

for (const [label, overrides] of [
  ["a session fork", { cliSessionId: nextSessionId }],
  ["cleared session metadata", { cliSessionId: "" }],
  ["an archived thread with a different session", { cliSessionId: nextSessionId, status: "archived" }],
]) {
  test(`native import survives an occupied primary key after ${label} without changing local history`, async () => {
    await withImportFixture(async ({ repository, sqlite, sync, directory }) => {
      const original = repository.createThread({ id: sessionId, projectName: "demo", title: "Local title", tokenUsed: 47,
        lastProvider: "codex", lastModel: "saved-model", lastReasoningEffort: "medium", ...overrides });
      repository.insertJob({ id: "local-job", threadId: original.id, chatId: "owner", request: "Local task", projectName: "demo", workdir: directory, provider: "codex", status: "completed" });
      const history = repository.listJobsByThread(original.id);
      await sync.importCodexAppThreads();
      const imported = repository.getThreadByCliSessionId(sessionId);
      assert.ok(imported);
      assert.notEqual(imported.id, original.id);
      assert.equal(imported.title, "Native conversation");
      assert.deepEqual(repository.getThread(original.id), original);
      assert.deepEqual(repository.listJobsByThread(original.id), history);
      await sync.importCodexAppThreads();
      assert.equal(repository.getThreadByCliSessionId(sessionId).id, imported.id);
      assert.equal(sqlite.prepare("select count(*) as count from threads").get().count, 2);
    });
  });
}

test("native import accounts for an occupied merged alias even when canonical lookup returns null", async () => {
  await withImportFixture(async ({ repository, sqlite, sync }) => {
    repository.createThread({ id: sessionId, projectName: "demo", title: "Alias", cliSessionId: nextSessionId, status: "merged" });
    // Also exercises legacy schemas, independently of the reconciliation feature.
    if (!sqlite.pragma("table_info(threads)").some((column) => column.name === "merged_into_id")) {
      sqlite.exec("alter table threads add column merged_into_id text");
    }
    sqlite.prepare("update threads set merged_into_id = ? where id = ?").run("missing-canonical", sessionId);
    await sync.importCodexAppThreads();
    assert.notEqual(repository.getThreadByCliSessionId(sessionId).id, sessionId);
    assert.equal(sqlite.prepare("select title, status, cli_session_id from threads where id = ?").get(sessionId).title, "Alias");
  });
});

test("overlapping importers sharing a database create only one native thread", async () => {
  await withImportFixture(async ({ repository, sqlite, sync, config, codexHomeDir, directory }) => {
    const otherDatabase = createDatabase({ filePath: path.join(directory, "talkeby.db") });
    try {
      const other = new CodexThreadSync({ repository: new TalkebyRepository(otherDatabase.db), config, codexHomeDir });
      await Promise.all([sync.importCodexAppThreads(), other.importCodexAppThreads()]);
      assert.equal(repository.getThreadByCliSessionId(sessionId).id, sessionId);
      assert.equal(sqlite.prepare("select count(*) as count from threads").get().count, 1);
    } finally { otherDatabase.sqlite.close(); }
  });
});

test("native import preserves an existing session owner and ordinary creates still reject duplicate IDs", async () => {
  await withImportFixture(async ({ repository, sync, sqlite }) => {
    const original = repository.createThread({ id: "local-thread", projectName: "demo", title: "Local title", cliSessionId: sessionId,
      updatedAt: "2026-10-12T00:00:00.000Z" });
    await sync.importCodexAppThreads();
    assert.deepEqual(repository.getThread("local-thread"), original);
    assert.equal(sqlite.prepare("select count(*) as count from threads").get().count, 1);
    assert.throws(() => repository.createThread({ id: "local-thread", projectName: "demo", title: "Overwrite" }));
  });
});

test("native import propagates unrelated database failures instead of hiding them", async () => {
  await withImportFixture(async ({ sqlite, sync, repository }) => {
    sqlite.exec("create trigger fail_import before insert on threads begin select raise(abort, 'fixture import failure'); end");
    await assert.rejects(sync.importCodexAppThreads(), /fixture import failure/);
    assert.equal(repository.getThreadByCliSessionId(sessionId), undefined);
  });
});
