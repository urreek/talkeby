import test from "node:test";
import assert from "node:assert/strict";

import { RuntimeState } from "../src/services/runtime-state.mjs";

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
