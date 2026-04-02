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
