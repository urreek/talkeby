import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { loadConfig } from "../src/config.mjs";

function withEnv(overrides, fn) {
  const original = { ...process.env };
  const next = { ...original };

  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }

  process.env = next;
  try {
    return fn();
  } finally {
    process.env = original;
  }
}

test("loadConfig uses WORKSPACE_DIR as the workspace root", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-config-"));
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir, { recursive: true });

  withEnv({
    PORT: undefined,
    CODEX_TIMEOUT_MS: undefined,
    WORKSPACE_DIR: workspaceDir,
    CODEX_WORKDIR: undefined,
    PROJECTS: undefined,
    CODEX_PROJECTS: undefined,
    DEFAULT_PROJECT: undefined,
    CODEX_DEFAULT_PROJECT: undefined,
  }, () => {
    const config = loadConfig();
    assert.equal(config.workspace.workdir, path.resolve(workspaceDir));
    assert.equal(config.workspace.projectsBaseDir, path.resolve(workspaceDir));
  });
});

test("loadConfig fails clearly when WORKSPACE_DIR does not exist", () => {
  const missingDir = path.join(os.tmpdir(), `talkeby-missing-${Date.now()}`);

  withEnv({
    WORKSPACE_DIR: missingDir,
    CODEX_WORKDIR: undefined,
  }, () => {
    assert.throws(
      () => loadConfig(),
      /WORKSPACE_DIR does not exist or is not a directory:/,
    );
  });
});
