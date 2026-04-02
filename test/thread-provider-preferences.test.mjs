import test from "node:test";
import assert from "node:assert/strict";

import {
  buildThreadProviderPreferencePatch,
  resolveThreadProviderPreferences,
} from "../src/services/thread-provider-preferences.mjs";

function createStateStub({
  provider = "codex",
  model = "gpt-5.4",
  reasoningEffort = "medium",
} = {}) {
  return {
    getProvider() {
      return provider;
    },
    getModel() {
      return model;
    },
    getReasoningEffort() {
      return reasoningEffort;
    },
  };
}

test("buildThreadProviderPreferencePatch normalizes persisted values", () => {
  const patch = buildThreadProviderPreferencePatch({
    provider: "Copilot",
    model: "",
    reasoningEffort: "HIGH",
  });

  assert.equal(patch.lastProvider, "copilot");
  assert.equal(patch.lastModel, "");
  assert.equal(patch.lastReasoningEffort, "high");
});

test("resolveThreadProviderPreferences prefers saved thread state", () => {
  const resolved = resolveThreadProviderPreferences({
    repository: {
      listJobsByThread() {
        return [];
      },
    },
    thread: {
      id: "thread-1",
      lastProvider: "copilot",
      lastModel: "gpt-5-mini",
      lastReasoningEffort: "high",
    },
    state: createStateStub(),
  });

  assert.deepEqual(resolved, {
    provider: "copilot",
    model: "gpt-5-mini",
    reasoningEffort: "high",
  });
});

test("resolveThreadProviderPreferences falls back to the latest thread job provider", () => {
  const resolved = resolveThreadProviderPreferences({
    repository: {
      listJobsByThread() {
        return [
          { provider: "codex" },
          { provider: "copilot" },
        ];
      },
    },
    thread: {
      id: "thread-2",
      lastProvider: "",
      lastModel: "",
      lastReasoningEffort: "",
    },
    state: createStateStub({
      provider: "codex",
      model: "gpt-5.4",
      reasoningEffort: "medium",
    }),
  });

  assert.equal(resolved.provider, "copilot");
  assert.equal(resolved.model, "");
  assert.equal(resolved.reasoningEffort, "");
});
