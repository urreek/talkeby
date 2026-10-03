import test from "node:test";
import assert from "node:assert/strict";

import {
  getProviderMeta,
  isSupportedProvider,
  listProviderCatalog,
  supportedProviderText,
} from "../src/providers/catalog.mjs";

test("copilot is exposed as a supported provider", () => {
  assert.equal(isSupportedProvider("copilot"), true);
  assert.match(supportedProviderText(), /\bcopilot\b/);
});

test("OpenAI and Claude fallback catalogs expose current coding models without retired suggestions", () => {
  const providers = listProviderCatalog();
  const codex = providers.find((provider) => provider.id === "codex");
  const claude = providers.find((provider) => provider.id === "claude");
  assert.equal(codex.defaultModel, "gpt-6.1-sol");
  for (const model of ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"]) {
    assert.ok(codex.models.some((option) => option.value === model));
  }
  assert.equal(claude.defaultModel, "");
  for (const model of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5"]) {
    assert.ok(claude.models.some((option) => option.value === model));
  }
  for (const model of ["claude-opus-4-1", "claude-haiku-3-5"]) {
    assert.equal(claude.models.some((option) => option.value === model), false);
  }
  for (const provider of [codex, claude]) {
    assert.equal(provider.models[0].value, "");
    assert.equal(new Set(provider.models.map((option) => option.value)).size, provider.models.length);
  }
});

test("copilot catalog metadata matches current capabilities", () => {
  const meta = getProviderMeta("copilot");
  assert.equal(meta?.label, "GitHub Copilot CLI");
  assert.equal(meta?.builtInAuth, true);
  assert.equal(meta?.supportsReasoningEffort, true);
  assert.equal(meta?.supportsPlanMode, false);
});

test("copilot appears in the provider catalog", () => {
  const provider = listProviderCatalog().find((item) => item.id === "copilot");
  assert.ok(provider);
  assert.equal(provider.supportsReasoningEffort, true);
  assert.deepEqual(
    provider.reasoningEfforts?.map((option) => option.value),
    ["low", "medium", "high", "xhigh"],
  );
  assert.equal(provider.defaultReasoningEffort, "medium");
  assert.deepEqual(
    provider.models,
    [
      {
        value: "",
        label: "Provider default",
        free: false,
      },
    ],
  );
});
