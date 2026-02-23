import { listCodexModels } from "../codex-app-server.mjs";
import { getProviderMeta, listProviderCatalog } from "./catalog.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DISCOVERY_TIMEOUT_MS = 8_000;
const DISCOVERY_USER_AGENT = "talkeby/0.1";
const execFileAsync = promisify(execFile);

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
  const seen = new Set();
  const entries = [];
  for (const item of models) {
    const value = textValue(item?.value || item?.model || "");
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const label = textValue(item?.label || item?.displayName || value);
    entries.push({
      value,
      label,
    });
  }
  return entries;
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

    if (!byValue.has(value)) {
      const normalized = {
        value,
        label: label || (value || "Provider default"),
        free: Boolean(option?.free),
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
    const { stdout } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
    return textValue(stdout);
  } catch {
    return "";
  }
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
  return providers.map((provider) => {
    const providerId = textValue(provider.id).toLowerCase();
    const discovered = discoveredMap.get(providerId) || [];
    if (!Array.isArray(discovered) || discovered.length === 0) {
      return provider;
    }
    const meta = getProviderMeta(providerId);
    if (!meta) {
      return provider;
    }
    const dynamicModels = toCatalogModels(discovered, meta, freeModelsOnly);
    if (!dynamicModels || dynamicModels.length <= 1) {
      return provider;
    }

    const mergedModels = mergeCatalogModels(dynamicModels, provider.models);
    return {
      ...provider,
      models: mergedModels,
    };
  }).map((provider) => {
    const meta = getProviderMeta(provider.id);
    return applyFreeModelsOnlyToProvider(provider, meta, freeModelsOnly);
  });
}
