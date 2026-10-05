import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { listProviderCatalog } from "../src/providers/catalog.mjs";
import { mergeCatalogModels } from "../src/providers/discovery.mjs";
import { getModelReasoningMetadata } from "../src/providers/model-reasoning.mjs";
import { getProviderReasoningConfig, resolveProviderReasoningEffort } from "../src/services/provider-reasoning.mjs";

const webRequire = createRequire(new URL("../web/package.json", import.meta.url));
const ts = webRequire("typescript");
const source = await readFile(new URL("../web/src/lib/reasoning.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { getReasoningConfig, resolveReasoningEffort } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("medium is the UI and backend default even when a model advertises another default", () => {
  for (const advertisedDefault of ["low", "high", "xhigh"]) {
    const provider = listProviderCatalog().find((item) => item.id === "codex");
    const model = provider.models.find((item) => item.value === "gpt-6.1-sol");
    model.defaultReasoningEffort = advertisedDefault;
    const input = { providerCatalog: [provider], providerId: provider.id, modelName: model.value };
    assert.equal(getReasoningConfig(provider, model.value).defaultReasoningEffort, "medium");
    assert.equal(getProviderReasoningConfig(input).defaultReasoningEffort, "medium");
    for (const currentEffort of ["", "invalid"]) {
      assert.equal(resolveReasoningEffort(provider, model.value, currentEffort), "medium");
      assert.equal(resolveProviderReasoningEffort({ ...input, currentEffort }), "medium");
    }
    assert.equal(resolveReasoningEffort(provider, model.value, "high"), "high");
    assert.equal(resolveProviderReasoningEffort({ ...input, currentEffort: "high" }), "high");
    model.reasoningEfforts = [{ value: "low", label: "low" }];
    model.defaultReasoningEffort = "low";
    assert.equal(resolveReasoningEffort(provider, model.value, ""), "low");
    assert.equal(resolveProviderReasoningEffort({ ...input, currentEffort: "" }), "low");
  }
});

test("current models enable matching effort selectors and backend validation without discovery", () => {
  const providers = listProviderCatalog();
  for (const provider of providers.filter((item) => ["codex", "claude"].includes(item.id))) {
    for (const model of provider.models.filter((item) => item.supportsReasoningEffort === true)) {
      const frontend = getReasoningConfig(provider, model.value);
      const backend = getProviderReasoningConfig({ providerCatalog: providers, providerId: provider.id, modelName: model.value });
      assert.equal(frontend.canSelectReasoning, true, model.value);
      assert.deepEqual(frontend.options.map((option) => option.value), backend.options.map((option) => option.value));
      assert.ok(frontend.options.some((option) => option.value === "max"));
      for (const option of frontend.options) {
        assert.equal(resolveReasoningEffort(provider, model.value, option.value), option.value);
        assert.equal(resolveProviderReasoningEffort({ providerCatalog: providers, providerId: provider.id, modelName: model.value, currentEffort: option.value }), option.value);
      }
    }
  }
  const codex = providers.find((item) => item.id === "codex");
  assert.equal(getReasoningConfig(codex, "__default__").canSelectReasoning, true);
  assert.equal(getReasoningConfig(codex, "gpt-6-luna").options[0].value, "none");
});

test("unsupported Haiku effort stays disabled in both the UI and backend", () => {
  const providers = listProviderCatalog();
  const claude = providers.find((item) => item.id === "claude");
  assert.equal(getReasoningConfig(claude, "claude-haiku-4-5").canSelectReasoning, false);
  assert.equal(resolveReasoningEffort(claude, "claude-haiku-4-5", "high"), "");
  assert.equal(resolveProviderReasoningEffort({ providerCatalog: providers, providerId: "claude", modelName: "claude-haiku-4-5", currentEffort: "high" }), "");
});

test("live discovery overrides static effort levels and defaults while missing metadata uses fallbacks", () => {
  const fallback = listProviderCatalog().find((item) => item.id === "codex").models;
  const live = { value: "gpt-6.1-sol", label: "Live Sol", reasoningEfforts: [{ value: "low", label: "Light" }], defaultReasoningEffort: "low" };
  const merged = mergeCatalogModels([live], fallback);
  const sol = merged.find((item) => item.value === live.value);
  assert.deepEqual(sol.reasoningEfforts.map((option) => option.value), ["low"]);
  assert.equal(sol.defaultReasoningEffort, "low");
  assert.equal(sol.label, "Live Sol");
  const noMetadata = mergeCatalogModels([{ value: live.value, label: "Sol" }], fallback);
  assert.ok(noMetadata.find((item) => item.value === live.value).reasoningEfforts.some((option) => option.value === "max"));
  assert.equal(getModelReasoningMetadata("claude", "claude-haiku-4-5-20251001").supportsReasoningEffort, false);
});
