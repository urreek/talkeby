import { listCodexModels } from "../codex-app-server.mjs";
import { getProviderMeta, listProviderCatalog } from "./catalog.mjs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnCompat } from "../lib/spawn-compat.mjs";

const DISCOVERY_TIMEOUT_MS = 8_000;
const DISCOVERY_USER_AGENT = "talkeby/0.1";

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function baseOption(meta) {
  return {
    value: "",
    label: "Provider default",
    free: meta.freeOnlyModels.length > 0,
  };
}
function normalizeReasoningEfforts(reasoningEfforts) {
  if (!Array.isArray(reasoningEfforts)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const item of reasoningEfforts) {
    const value = textValue(item?.value || item?.reasoningEffort || "").toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push({
      value,
      label: textValue(item?.label || item?.reasoningEffort || value) || value,
      description: textValue(item?.description || ""),
    });
  }
  return normalized;
}

function applyFreeModelsOnlyToProvider(provider, meta, freeModelsOnly) {
  if (!freeModelsOnly || !meta || meta.freeOnlyModels.length === 0) {
    return provider;
  }

  const allowed = new Set(meta.freeOnlyModels);
  const filtered = [];
  const seen = new Set();

  for (const option of provider.models || []) {
    const value = textValue(option?.value || "");
    if (value === "") {
      filtered.push(option);
      seen.add(value);
      continue;
    }
    if (!allowed.has(value) || seen.has(value)) {
      continue;
    }
    filtered.push({
      ...option,
      free: true,
    });
    seen.add(value);
  }

  for (const model of meta.freeOnlyModels) {
    if (seen.has(model)) {
      continue;
    }
    filtered.push({
      value: model,
      label: model,
      free: true,
    });
    seen.add(model);
  }

  return {
    ...provider,
    models: filtered,
  };
}

function dedupeDiscoveredModels(models) {
  const byValue = new Map();
  const ordered = [];

  for (const item of models) {
    const value = textValue(item?.value || item?.model || "");
    if (!value) {
      continue;
    }
    const label = textValue(item?.label || item?.displayName || value);
    const reasoningEfforts = normalizeReasoningEfforts(
      item?.reasoningEfforts || item?.supportedReasoningEfforts,
    );
    const defaultReasoningEffort = textValue(item?.defaultReasoningEffort || "").toLowerCase();
    const isDefault = Boolean(item?.isDefault);

    if (!byValue.has(value)) {
      byValue.set(value, {
        value,
        label,
        reasoningEfforts,
        defaultReasoningEffort,
        isDefault,
      });
      ordered.push(value);
      continue;
    }

    const current = byValue.get(value);
    if (label) {
      current.label = label;
    }
    if (reasoningEfforts.length > 0) {
      current.reasoningEfforts = reasoningEfforts;
    }
    if (defaultReasoningEffort) {
      current.defaultReasoningEffort = defaultReasoningEffort;
    }
    current.isDefault = Boolean(current.isDefault || isDefault);
  }

  return ordered.map((value) => byValue.get(value));
}

function enforceFreeModelsOnly(discovered, meta, freeModelsOnly) {
  if (!freeModelsOnly || meta.freeOnlyModels.length === 0) {
    return discovered;
  }

  const allowed = new Set(meta.freeOnlyModels);
  const filtered = discovered.filter((item) => allowed.has(item.value));
  const seen = new Set(filtered.map((item) => item.value));

  for (const model of meta.freeOnlyModels) {
    if (seen.has(model)) {
      continue;
    }
    filtered.push({
      value: model,
      label: model,
    });
    seen.add(model);
  }

  return filtered;
}

function toCatalogModels(discovered, meta, freeModelsOnly) {
  const deduped = dedupeDiscoveredModels(discovered);
  const constrained = enforceFreeModelsOnly(deduped, meta, freeModelsOnly);
  if (constrained.length === 0) {
    return null;
  }
  return [
    baseOption(meta),
    ...constrained.map((item) => ({
      value: item.value,
      label: item.label,
      free: meta.freeOnlyModels.includes(item.value),
      reasoningEfforts: item.reasoningEfforts || [],
      defaultReasoningEffort: item.defaultReasoningEffort || "",
    })),
  ];
}

function mergeCatalogModels(dynamicModels, existingModels) {
  const byValue = new Map();
  const ordered = [];

  function addOption(option, preferLabel = false) {
    const value = textValue(option?.value || "");
    const label = textValue(option?.label || "");
    if (!value && value !== "") {
      return;
    }
    const reasoningEfforts = normalizeReasoningEfforts(option?.reasoningEfforts);
    const defaultReasoningEffort = textValue(option?.defaultReasoningEffort || "").toLowerCase();

    if (!byValue.has(value)) {
      const normalized = {
        value,
        label: label || (value || "Provider default"),
        free: Boolean(option?.free),
        reasoningEfforts,
        defaultReasoningEffort,
      };
      byValue.set(value, normalized);
      ordered.push(value);
      return;
    }

    const current = byValue.get(value);
    if (preferLabel && label) {
      current.label = label;
    }
    current.free = Boolean(current.free || option?.free);
    if (reasoningEfforts.length > 0) {
      current.reasoningEfforts = reasoningEfforts;
    }
    if (defaultReasoningEffort) {
      current.defaultReasoningEffort = defaultReasoningEffort;
    }
  }

  for (const option of dynamicModels) {
    addOption(option, true);
  }
  for (const option of existingModels || []) {
    addOption(option, false);
  }

  return ordered.map((value) => byValue.get(value));
}

async function fetchJson(url, headers = {}, timeoutMs = DISCOVERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": DISCOVERY_USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function safeExecCapture(binary, args = [], timeoutMs = DISCOVERY_TIMEOUT_MS) {
  try {
    const child = spawnCompat(binary, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    let settled = false;
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGTERM");
        resolve("");
      }, timeoutMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 4 * 1024 * 1024) {
          stdout = stdout.slice(0, 4 * 1024 * 1024);
        }
      });

      child.on("error", () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve("");
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(code === 0 ? stdout : "");
      });
    });

    return textValue(result);
  } catch {
    return "";
  }
}

export function extractCopilotModelsFromConfigHelp(helpText) {
  const normalized = textValue(helpText);
  if (!normalized) {
    return [];
  }

  const sectionMatch = normalized.match(/`model`:[\s\S]*?(?=\r?\n\s*`[a-zA-Z]|\s*$)/);
  if (!sectionMatch) {
    return [];
  }

  const seen = new Set();
  const discovered = [];
  for (const match of sectionMatch[0].matchAll(/-\s+"([^"]+)"/g)) {
    const value = textValue(match[1]);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    discovered.push({
      value,
      label: value,
    });
  }
  return discovered;
}

export function extractCopilotReasoningEffortsFromHelp(helpText) {
  const normalized = textValue(helpText);
  if (!normalized) {
    return [];
  }

  const choicesMatch = normalized.match(
    /--effort,\s+--reasoning-effort\s+<level>[\s\S]*?\(choices:\s*([^)]+)\)/i,
  );
  if (!choicesMatch) {
    return [];
  }

  const choices = [...choicesMatch[1].matchAll(/"([^"]+)"/g)]
    .map((match) => textValue(match[1]).toLowerCase())
    .filter(Boolean);

  return normalizeReasoningEfforts(
    choices.map((value) => ({
      value,
      label: value,
    })),
  );
}

function resolveCopilotHomeDir() {
  const configured = textValue(process.env.COPILOT_HOME || "");
  if (configured) {
    return configured;
  }
  return path.join(os.homedir(), ".copilot");
}

function collectTextParts(value, output = []) {
  if (typeof value === "string") {
    const text = textValue(value);
    if (text) {
      output.push(text);
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, output);
    }
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const key of ["message", "text", "content", "response", "delta", "body", "value"]) {
    if (key in value) {
      collectTextParts(value[key], output);
    }
  }

  return output;
}

function dedupeModelEntries(models) {
  const seen = new Set();
  const deduped = [];
  for (const item of models) {
    const value = textValue(item?.value || "");
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push({
      value,
      label: textValue(item?.label || value) || value,
    });
  }
  return deduped;
}

function extractCopilotModelTokens(text) {
  const normalized = textValue(text);
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(
    /\b(?:gpt-[a-z0-9.-]+|claude-[a-z0-9.-]+|gemini-[a-z0-9.-]+|grok-[a-z0-9.-]+|raptor-[a-z0-9.-]+|o[0-9]+(?:-[a-z0-9.-]+)?)\b/gi,
  ) || [];
  return dedupeModelEntries(
    matches
      .map((token) => textValue(token))
      .filter((token) => token && !token.includes("/"))
      .map((value) => ({ value, label: value })),
  );
}

export function extractCopilotModelsFromModelCommandOutput(outputText) {
  const normalized = textValue(outputText);
  if (!normalized) {
    return [];
  }

  const textParts = [];
  for (const line of normalized.split(/\r?\n/)) {
    const candidate = textValue(line);
    if (!candidate) {
      continue;
    }
    try {
      const payload = JSON.parse(candidate);
      collectTextParts(payload, textParts);
    } catch {
      textParts.push(candidate);
    }
  }

  return extractCopilotModelTokens(textParts.join("\n"));
}

export function extractCopilotModelsFromSessionEvents(eventsText) {
  const normalized = textValue(eventsText);
  if (!normalized) {
    return [];
  }

  const textParts = [];
  for (const line of normalized.split(/\r?\n/)) {
    const candidate = textValue(line);
    if (!candidate) {
      continue;
    }

    try {
      const payload = JSON.parse(candidate);
      const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
      for (const value of [
        data?.selectedModel,
        data?.previousModel,
        data?.newModel,
        data?.currentModel,
        data?.model,
      ]) {
        const text = textValue(value);
        if (text) {
          textParts.push(text);
        }
      }

      if (data?.modelMetrics && typeof data.modelMetrics === "object") {
        textParts.push(...Object.keys(data.modelMetrics).map((value) => textValue(value)).filter(Boolean));
      }
    } catch {
      textParts.push(candidate);
    }
  }

  return extractCopilotModelTokens(textParts.join("\n"));
}

export function extractCopilotModelsFromLogOutput(logText) {
  const normalized = textValue(logText);
  if (!normalized) {
    return [];
  }

  const relevantLines = normalized
    .split(/\r?\n/)
    .map((line) => textValue(line))
    .filter((line) => line.includes("Using default model:") || line.includes("Model changed to:"));
  return extractCopilotModelTokens(relevantLines.join("\n"));
}

async function safeReadTextFile(filename) {
  try {
    return await fs.readFile(filename, "utf8");
  } catch {
    return "";
  }
}

async function discoverCopilotModelsFromCache() {
  const copilotHome = resolveCopilotHomeDir();
  const discovered = [];

  const sessionStateDir = path.join(copilotHome, "session-state");
  let sessionEntries = [];
  try {
    sessionEntries = await fs.readdir(sessionStateDir, { withFileTypes: true });
  } catch {
    sessionEntries = [];
  }

  for (const entry of sessionEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const eventsText = await safeReadTextFile(path.join(sessionStateDir, entry.name, "events.jsonl"));
    discovered.push(...extractCopilotModelsFromSessionEvents(eventsText));
  }

  const logsDir = path.join(copilotHome, "logs");
  let logEntries = [];
  try {
    logEntries = await fs.readdir(logsDir, { withFileTypes: true });
  } catch {
    logEntries = [];
  }

  for (const entry of logEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".log")) {
      continue;
    }
    const logText = await safeReadTextFile(path.join(logsDir, entry.name));
    discovered.push(...extractCopilotModelsFromLogOutput(logText));
  }

  return dedupeModelEntries(discovered);
}

function extractModelTokens(text) {
  const seen = new Set();
  const entries = [];
  const patterns = [
    /claude-[a-z0-9.-]+/gi,
    /gemini-[a-z0-9.-]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = textValue(match[0] || "").toLowerCase();
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      entries.push({
        value,
        label: value,
      });
    }
  }
  return entries;
}

async function discoverCodexModels(config) {
  const models = await listCodexModels({
    codexConfig: config.codex,
  });
  return models.map((item) => ({
    value: textValue(item?.model),
    label: textValue(item?.displayName) || textValue(item?.model),
    reasoningEfforts: normalizeReasoningEfforts(item?.supportedReasoningEfforts),
    defaultReasoningEffort: textValue(item?.defaultReasoningEffort || "").toLowerCase(),
    isDefault: Boolean(item?.isDefault),
  }));
}

async function discoverClaudeModels(config) {
  const discovered = [];

  const apiKey = textValue(process.env.ANTHROPIC_API_KEY || "");
  if (!apiKey) {
    const helpText = await safeExecCapture(
      config.runner?.binaries?.claude || "claude",
      ["--help"],
    );
    return extractModelTokens(helpText);
  }

  try {
    const body = await fetchJson("https://api.anthropic.com/v1/models", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    const rows = Array.isArray(body?.data) ? body.data : [];
    for (const item of rows) {
      const id = textValue(item?.id);
      const display = textValue(item?.display_name || item?.displayName || "");
      if (!id) {
        continue;
      }
      discovered.push({
        value: id,
        label: display || id,
      });
    }
  } catch {
    // Fall through to CLI parsing.
  }

  const helpText = await safeExecCapture(
    config.runner?.binaries?.claude || "claude",
    ["--help"],
  );
  discovered.push(...extractModelTokens(helpText));
  return discovered;
}

async function discoverGeminiModels(config) {
  const discovered = [];

  const apiKey = textValue(process.env.GOOGLE_API_KEY || "");
  if (apiKey) {
    try {
      const apiBase = textValue(process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com");
      const apiVersion = textValue(process.env.GEMINI_API_VERSION || "v1beta");
      const base = apiBase.replace(/\/+$/, "");
      const url = `${base}/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`;
      const body = await fetchJson(url);
      const rows = Array.isArray(body?.models) ? body.models : [];
      for (const item of rows) {
        const methods = Array.isArray(item?.supportedGenerationMethods)
          ? item.supportedGenerationMethods
          : [];
        if (methods.length > 0 && !methods.includes("generateContent")) {
          continue;
        }
        const rawName = textValue(item?.name);
        const model = rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
        const display = textValue(item?.displayName || "");
        if (!model) {
          continue;
        }
        discovered.push({
          value: model,
          label: display || model,
        });
      }
    } catch {
      // Fall through to CLI parsing.
    }
  }

  const helpText = await safeExecCapture(
    config.runner?.binaries?.gemini || "gemini",
    ["--help"],
  );
  discovered.push(...extractModelTokens(helpText));
  return discovered;
}

async function discoverCopilotModels(config) {
  const binary = config.runner?.binaries?.copilot || "copilot";
  const discovered = [];

  const modelCommandOutput = await safeExecCapture(
    binary,
    ["-p", "/model", "--output-format", "json", "--allow-all-tools", "--allow-all-paths", "--no-ask-user"],
  );
  const fromSession = extractCopilotModelsFromModelCommandOutput(modelCommandOutput);
  discovered.push(...fromSession);

  const fromCache = await discoverCopilotModelsFromCache();
  discovered.push(...fromCache);

  const configHelpText = await safeExecCapture(binary, ["help", "config"]);
  const fromConfigHelp = extractCopilotModelsFromConfigHelp(configHelpText);
  discovered.push(...fromConfigHelp);

  return dedupeModelEntries(discovered);
}

async function discoverCopilotReasoningConfig(config) {
  const helpText = await safeExecCapture(
    config.runner?.binaries?.copilot || "copilot",
    ["--help"],
  );
  const reasoningEfforts = extractCopilotReasoningEffortsFromHelp(helpText);
  if (reasoningEfforts.length === 0) {
    return null;
  }

  return {
    reasoningEfforts,
    defaultReasoningEffort: reasoningEfforts.some((option) => option.value === "medium")
      ? "medium"
      : (reasoningEfforts[0]?.value || ""),
  };
}

async function discoverGroqModels() {
  const apiKey = textValue(process.env.GROQ_API_KEY || "");
  if (!apiKey) {
    return [];
  }
  const apiBase = textValue(process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1");
  const base = apiBase.replace(/\/+$/, "");
  const body = await fetchJson(`${base}/models`, {
    Authorization: `Bearer ${apiKey}`,
  });
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((item) => {
    const id = textValue(item?.id);
    return {
      value: id,
      label: id,
    };
  });
}

async function discoverOpenRouterModels() {
  const apiKey = textValue(process.env.OPENROUTER_API_KEY || "");
  if (!apiKey) {
    return [];
  }
  const apiBase = textValue(process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api/v1");
  const base = apiBase.replace(/\/+$/, "");
  const body = await fetchJson(`${base}/models`, {
    Authorization: `Bearer ${apiKey}`,
  });
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((item) => {
    const id = textValue(item?.id);
    const display = textValue(item?.name || "");
    return {
      value: id,
      label: display || id,
    };
  });
}

async function discoverModelsForProvider(providerId, config) {
  if (providerId === "codex") {
    return discoverCodexModels(config);
  }
  if (providerId === "claude") {
    return discoverClaudeModels(config);
  }
  if (providerId === "gemini") {
    return discoverGeminiModels(config);
  }
  if (providerId === "copilot") {
    return discoverCopilotModels(config);
  }
  if (providerId === "groq") {
    return discoverGroqModels();
  }
  if (providerId === "openrouter") {
    return discoverOpenRouterModels();
  }
  return [];
}

export async function buildProviderCatalogWithDiscovery({ config, log }) {
  const providers = listProviderCatalog().map((provider) => {
    const meta = getProviderMeta(provider.id);
    return applyFreeModelsOnlyToProvider(
      provider,
      meta,
      Boolean(config.runner?.freeModelsOnly),
    );
  });
  const freeModelsOnly = Boolean(config.runner?.freeModelsOnly);

  if (!config.providers?.discoverModels) {
    return providers;
  }

  const discoveredPerProvider = await Promise.all(
    providers.map(async (provider) => {
      const providerId = textValue(provider.id).toLowerCase();
      try {
        const models = await discoverModelsForProvider(providerId, config);
        return [providerId, models];
      } catch (error) {
        if (log) {
          log.warn(
            { err: error, provider: providerId },
            "Model discovery failed; falling back to static models.",
          );
        }
        return [providerId, []];
      }
    }),
  );

  const discoveredMap = new Map(discoveredPerProvider);
  const copilotReasoningConfig = await discoverCopilotReasoningConfig(config).catch(() => null);
  return providers.map((provider) => {
    const providerId = textValue(provider.id).toLowerCase();
    const discovered = discoveredMap.get(providerId) || [];
    const nextProvider = providerId === "copilot" && copilotReasoningConfig
      ? {
        ...provider,
        reasoningEfforts: copilotReasoningConfig.reasoningEfforts,
        defaultReasoningEffort: copilotReasoningConfig.defaultReasoningEffort || provider.defaultReasoningEffort,
      }
      : provider;
    if (!Array.isArray(discovered) || discovered.length === 0) {
      return nextProvider;
    }
    const meta = getProviderMeta(providerId);
    if (!meta) {
      return nextProvider;
    }
    const dynamicModels = toCatalogModels(discovered, meta, freeModelsOnly);
    const dynamicDefaultModel = dedupeDiscoveredModels(discovered).find((item) => item.isDefault)?.value || "";
    if (!dynamicModels || dynamicModels.length <= 1) {
      return nextProvider;
    }

    const mergedModels = mergeCatalogModels(dynamicModels, nextProvider.models);
    return {
      ...nextProvider,
      defaultModel: dynamicDefaultModel || nextProvider.defaultModel,
      models: mergedModels,
    };
  }).map((provider) => {
    const meta = getProviderMeta(provider.id);
    return applyFreeModelsOnlyToProvider(provider, meta, freeModelsOnly);
  });
}

