import test from "node:test";
import assert from "node:assert/strict";

import {
  getProviderReasoningConfig,
  resolveProviderReasoningEffort,
} from "../src/services/provider-reasoning.mjs";

function createProviderCatalog() {
  return [
    {
      id: "codex",
      label: "OpenAI Codex",
      defaultModel: "gpt-5.4",
      supportsReasoningEffort: true,
      supportsPlanMode: true,
      models: [
        {
          value: "",
          label: "Provider default",
          free: false,
        },
        {
          value: "gpt-5.4",
          label: "gpt-5.4",
          free: false,
          reasoningEfforts: [
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
            { value: "xhigh", label: "xhigh" },
          ],
          defaultReasoningEffort: "medium",
        },
        {
          value: "gpt-5.1-codex-mini",
          label: "gpt-5.1-codex-mini",
          free: false,
          reasoningEfforts: [
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
          ],
          defaultReasoningEffort: "medium",
        },
      ],
    },
    {
      id: "claude",
      label: "Claude Code",
      defaultModel: "claude-sonnet-4-6",
      supportsReasoningEffort: true,
      supportsPlanMode: true,
      models: [
        {
          value: "",
          label: "Provider default",
          free: false,
        },
        {
          value: "claude-sonnet-4-6",
          label: "claude-sonnet-4-6",
          free: false,
        },
      ],
    },
    {
      id: "copilot",
      label: "GitHub Copilot CLI",
      defaultModel: "",
      supportsReasoningEffort: true,
      supportsPlanMode: false,
      reasoningEfforts: [
        { value: "low", label: "low" },
        { value: "medium", label: "medium" },
        { value: "high", label: "high" },
        { value: "xhigh", label: "xhigh" },
      ],
      defaultReasoningEffort: "medium",
      models: [
        {
          value: "",
          label: "Provider default",
          free: false,
        },
      ],
    },
  ];
}

test("Codex reasoning config comes from discovered model metadata", () => {
  const config = getProviderReasoningConfig({
    providerCatalog: createProviderCatalog(),
    providerId: "codex",
    modelName: "gpt-5.4",
  });

  assert.equal(config.supportsReasoning, true);
  assert.deepEqual(
    config.options.map((option) => option.value),
    ["low", "medium", "high", "xhigh"],
  );
  assert.equal(config.defaultReasoningEffort, "medium");
});

test("Codex reasoning resolves to the model default when the current value is invalid", () => {
  const resolved = resolveProviderReasoningEffort({
    providerCatalog: createProviderCatalog(),
    providerId: "codex",
    modelName: "gpt-5.1-codex-mini",
    currentEffort: "xhigh",
  });

  assert.equal(resolved, "medium");
});

test("Non-Codex providers keep the generic reasoning fallback when discovery has no metadata yet", () => {
  const config = getProviderReasoningConfig({
    providerCatalog: createProviderCatalog(),
    providerId: "claude",
    modelName: "claude-sonnet-4-6",
  });

  assert.equal(config.supportsReasoning, true);
  assert.deepEqual(
    config.options.map((option) => option.value),
    ["low", "medium", "high"],
  );
  assert.equal(config.defaultReasoningEffort, "medium");
});

test("Copilot reasoning comes from provider metadata when model metadata is absent", () => {
  const config = getProviderReasoningConfig({
    providerCatalog: createProviderCatalog(),
    providerId: "copilot",
    modelName: "",
  });

  assert.equal(config.supportsReasoning, true);
  assert.deepEqual(
    config.options.map((option) => option.value),
    ["low", "medium", "high", "xhigh"],
  );
  assert.equal(config.defaultReasoningEffort, "medium");
});
