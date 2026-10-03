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

test("loadConfig falls back to the Talkeby directory when WORKSPACE_DIR does not exist", () => {
  const missingDir = path.join(os.tmpdir(), `talkeby-missing-${Date.now()}`);

  withEnv({
    WORKSPACE_DIR: missingDir,
    CODEX_WORKDIR: undefined,
  }, () => {
    const config = loadConfig();
    const expectedFallback = path.resolve(process.cwd());
    assert.equal(config.workspace.workdir, expectedFallback);
    assert.equal(config.workspace.projectsBaseDir, expectedFallback);
  });
});

test("unconfigured Codex uses the current catalog default while explicit model overrides are preserved", () => {
  const baseEnv = { AI_PROVIDER: "codex", AI_MODEL: undefined, CODEX_MODEL: undefined };
  withEnv(baseEnv, () => {
    const config = loadConfig();
    assert.equal(config.codex.model, "gpt-6.1-sol");
    assert.equal(config.runner.model, "gpt-6.1-sol");
  });
  withEnv({ ...baseEnv, CODEX_MODEL: "pinned-codex-model", AI_MODEL: "pinned-runner-model" }, () => {
    const config = loadConfig();
    assert.equal(config.codex.model, "pinned-codex-model");
    assert.equal(config.runner.model, "pinned-runner-model");
  });
  withEnv({ ...baseEnv, AI_PROVIDER: "claude" }, () => {
    assert.equal(loadConfig().runner.model, "");
  });
});
