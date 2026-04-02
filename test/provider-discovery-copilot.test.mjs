import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import {
  buildProviderCatalogWithDiscovery,
  extractCopilotModelsFromConfigHelp,
  extractCopilotModelsFromLogOutput,
  extractCopilotModelsFromModelCommandOutput,
  extractCopilotReasoningEffortsFromHelp,
  extractCopilotModelsFromSessionEvents,
} from "../src/providers/discovery.mjs";

function createConfig() {
  return {
    codex: {},
    runner: {
      binaries: {
        claude: "claude",
        gemini: "gemini",
        copilot: "copilot",
      },
      freeModelsOnly: false,
    },
    providers: {
      discoverModels: true,
    },
  };
}

test("copilot discovery keeps CLI-safe static model options", async () => {
  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = "C:\\\\nonexistent-talkeby-copilot-home";
  const config = createConfig();
  config.runner.binaries.copilot = "C:\\\\nonexistent-talkeby-copilot.cmd";

  try {
  const providers = await buildProviderCatalogWithDiscovery({
    config,
    log: null,
  });

  const copilot = providers.find((provider) => provider.id === "copilot");
  assert.ok(copilot);
  assert.deepEqual(copilot.models.map((model) => model.value), [""]);
  assert.equal(copilot.models.some((model) => model.value.includes("/")), false);
  } finally {
    if (previousHome === undefined) {
      delete process.env.COPILOT_HOME;
    } else {
      process.env.COPILOT_HOME = previousHome;
    }
  }
});

test("copilot /model parser extracts model names from JSONL output", () => {
  const output = [
    "{\"type\":\"assistant.message\",\"data\":{\"content\":\"Available models:\\n- gpt-5-mini\\n- gpt-5.2\\n- claude-sonnet-4.6\\n- gemini-3-pro-preview\"}}",
    "{\"type\":\"assistant.message\",\"data\":{\"content\":\"Current model: gpt-5-mini\"}}",
  ].join("\n");

  const models = extractCopilotModelsFromModelCommandOutput(output);
  assert.deepEqual(
    models.map((item) => item.value),
    ["gpt-5-mini", "gpt-5.2", "claude-sonnet-4.6", "gemini-3-pro-preview"],
  );
});

test("copilot config help parser extracts model names from model info", () => {
  const helpText = [
    "`model`:",
    "  Select the model to use.",
    "  Choices:",
    "  - \"gpt-5-mini\"",
    "  - \"claude-sonnet-4.6\"",
    "  - \"gemini-3-pro-preview\"",
  ].join("\n");

  const models = extractCopilotModelsFromConfigHelp(helpText);
  assert.deepEqual(
    models.map((item) => item.value),
    ["gpt-5-mini", "claude-sonnet-4.6", "gemini-3-pro-preview"],
  );
});

test("copilot /model parser ignores provider-prefixed model ids", () => {
  const output = "{\"type\":\"assistant.message\",\"data\":{\"content\":\"openai/gpt-5-mini\\ngpt-5-mini\"}}";
  const models = extractCopilotModelsFromModelCommandOutput(output);
  assert.deepEqual(
    models.map((item) => item.value),
    ["gpt-5-mini"],
  );
});

test("copilot session cache parser extracts proven models", () => {
  const events = [
    "{\"type\":\"session.start\",\"data\":{\"selectedModel\":\"gpt-5-mini\"}}",
    "{\"type\":\"session.model_change\",\"data\":{\"previousModel\":\"gpt-5-mini\",\"newModel\":\"gpt-5.2\"}}",
    "{\"type\":\"session.shutdown\",\"data\":{\"currentModel\":\"gpt-5.2\",\"modelMetrics\":{\"claude-haiku-4.5\":{\"requests\":{\"count\":1}}}}}",
  ].join("\n");

  const models = extractCopilotModelsFromSessionEvents(events);
  assert.deepEqual(
    models.map((item) => item.value),
    ["gpt-5-mini", "gpt-5.2", "claude-haiku-4.5"],
  );
});

test("copilot log parser extracts only successful/default models", () => {
  const logText = [
    "2026-03-30T00:00:00.000Z [WARNING] Model 'grok-code-fast-1' from CLI argument is not available.",
    "2026-03-30T00:00:00.000Z [INFO] Using default model: claude-haiku-4.5",
    "2026-03-30T00:00:00.000Z [INFO] Model changed to: gpt-5-mini",
  ].join("\n");

  const models = extractCopilotModelsFromLogOutput(logText);
  assert.deepEqual(
    models.map((item) => item.value),
    ["claude-haiku-4.5", "gpt-5-mini"],
  );
});

test("copilot discovery merges cache and config-help models instead of stopping early", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-copilot-discovery-"));
  const tempHome = path.join(tempRoot, ".copilot");
  const sessionDir = path.join(tempHome, "session-state", "session-1");
  const binary = path.join(tempRoot, "fake-copilot.cmd");
  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = tempHome;
  const config = createConfig();
  config.runner.binaries.copilot = binary;

  try {
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, "events.jsonl"),
      "{\"type\":\"session.start\",\"data\":{\"selectedModel\":\"claude-haiku-4.5\"}}\n",
      "utf8",
    );
    await fs.writeFile(binary, [
      "@echo off",
      "if \"%1\"==\"help\" (",
      "  echo `model`:",
      "  echo   Select the model to use.",
      "  echo   Choices:",
      "  echo   - \"gpt-5-mini\"",
      "  echo   - \"claude-sonnet-4.6\"",
      "  echo   - \"gemini-3-pro-preview\"",
      "  exit /b 0",
      ")",
      "exit /b 0",
      "",
    ].join("\r\n"), "utf8");

    const providers = await buildProviderCatalogWithDiscovery({
      config,
      log: null,
    });

    const copilot = providers.find((provider) => provider.id === "copilot");
    assert.ok(copilot);
    assert.deepEqual(
      copilot.models.map((model) => model.value),
      ["", "claude-haiku-4.5", "gpt-5-mini", "claude-sonnet-4.6", "gemini-3-pro-preview"],
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.COPILOT_HOME;
    } else {
      process.env.COPILOT_HOME = previousHome;
    }
  }
});

test("copilot help parser extracts reasoning effort choices", () => {
  const helpText = [
    "Usage: copilot [options]",
    "",
    "Options:",
    "  --effort, --reasoning-effort <level>  Set the reasoning effort level",
    "                                       (choices: \"low\", \"medium\", \"high\", \"xhigh\")",
  ].join("\n");

  const options = extractCopilotReasoningEffortsFromHelp(helpText);
  assert.deepEqual(
    options.map((item) => item.value),
    ["low", "medium", "high", "xhigh"],
  );
});
