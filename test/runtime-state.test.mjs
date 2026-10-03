import test from "node:test";
import assert from "node:assert/strict";

import { RuntimeState } from "../src/services/runtime-state.mjs";
import { OWNER_SETTING_KEYS } from "../src/services/owner-context.mjs";

function createRepositoryStub() {
  return {
    denyPendingRuntimeApprovals() {},
    listProjects() { return []; },
    listRecentJobs() { return []; },
    getAppSetting() { return null; },
    setAppSetting() {},
  };
}

function createConfig() {
  return {
    app: { defaultExecutionMode: "auto" },
    runner: { provider: "codex", model: "gpt-5.4" },
    codex: {
      projects: new Map(),
      defaultProjectName: "",
    },
  };
}

test("reasoning effort defaults to medium, resets when cleared, and accepts dynamic values", () => {
  const state = new RuntimeState({
    config: createConfig(),
    repository: createRepositoryStub(),
  });

  assert.equal(state.getReasoningEffort(), "medium");
  assert.equal(state.setReasoningEffort("high"), "high");
  assert.equal(state.getReasoningEffort(), "high");
  assert.equal(state.setReasoningEffort("xhigh"), "xhigh");
  assert.equal(state.getReasoningEffort(), "xhigh");
  assert.equal(state.setReasoningEffort(""), "medium");
  assert.equal(state.getReasoningEffort(), "medium");
});

test("model defaults from runtime config", () => {
  const state = new RuntimeState({
    config: createConfig(),
    repository: createRepositoryStub(),
  });

  assert.equal(state.getProvider(), "codex");
  assert.equal(state.getModel(), "gpt-5.4");
});

function createProjectState() {
  const deleted = [];
  const settings = new Map();
  const config = createConfig();
  config.workspace = {
    projects: new Map([["alpha", "/alpha"], ["beta", "/beta"]]),
    defaultProjectName: "alpha",
  };
  const repository = {
    ...createRepositoryStub(),
    deleteProject(name) { deleted.push(name); },
    setAppSetting({ key, value }) { settings.set(key, value); },
  };
  const state = new RuntimeState({ config, repository });
  state.setProject("alpha");
  return { state, deleted, settings, repository };
}

test("removing the active default project persists deletion and selects a remaining project", () => {
  const { state, deleted, settings } = createProjectState();
  assert.deepEqual(state.removeProject("ALPHA"), { ok: true });
  assert.deepEqual(deleted, ["alpha"]);
  assert.deepEqual(state.listProjects(), [{ name: "beta", path: "/beta" }]);
  assert.deepEqual(state.getProject(), { name: "beta", workdir: "/beta" });
  assert.equal(settings.get(OWNER_SETTING_KEYS.activeProject), "beta");

  assert.deepEqual(state.removeProject("beta"), { ok: true });
  assert.deepEqual(state.getProject(), { name: "", workdir: "" });
  assert.equal(settings.get(OWNER_SETTING_KEYS.activeProject), "");
});

test("removing an inactive project preserves selection and rejects unknown projects", () => {
  const { state, deleted } = createProjectState();
  assert.deepEqual(state.removeProject("beta"), { ok: true });
  assert.deepEqual(state.getProject(), { name: "alpha", workdir: "/alpha" });
  assert.deepEqual(state.removeProject("missing"), { error: "Project was not found." });
  assert.deepEqual(deleted, ["beta"]);
});

test("failed project persistence leaves runtime selection intact", () => {
  const { state, repository } = createProjectState();
  repository.deleteProject = () => { throw new Error("Database unavailable"); };
  assert.throws(() => state.removeProject("alpha"), /Database unavailable/);
  assert.equal(state.listProjects().length, 2);
  assert.deepEqual(state.getProject(), { name: "alpha", workdir: "/alpha" });
});
