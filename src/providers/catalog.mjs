export const PROVIDER_CATALOG = {
  codex: {
    id: "codex",
    label: "OpenAI Codex",
    binaryKey: "codex",
    envKey: "OPENAI_API_KEY",
    builtInAuth: true,
    defaultModel: "",
    catalogModels: [
      "gpt-5-codex",
      "gpt-5",
      "gpt-5-mini",
      "o3",
      "o4-mini",
    ],
    freeOnlyModels: [],
    supportsReasoningEffort: true,
    supportsPlanMode: true,
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    binaryKey: "claude",
    envKey: "ANTHROPIC_API_KEY",
    builtInAuth: false,
    defaultModel: "",
    catalogModels: [
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-haiku-3-5",
    ],
    freeOnlyModels: [],
    supportsReasoningEffort: true,
    supportsPlanMode: true,
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    binaryKey: "gemini",
    envKey: "GOOGLE_API_KEY",
    builtInAuth: false,
    defaultModel: "gemini-2.5-flash",
    catalogModels: [
      "gemini-3.1-pro",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    freeOnlyModels: [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite"
    ],
    supportsReasoningEffort: true,
    supportsPlanMode: true,
  },
  groq: {
    id: "groq",
    label: "Groq (Free Tier)",
    binaryKey: "aider",
    envKey: "GROQ_API_KEY",
    builtInAuth: false,
    defaultModel: "llama-3.1-8b-instant",
    catalogModels: [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "qwen/qwen3-32b",
    ],
    freeOnlyModels: [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "qwen/qwen3-32b"
    ],
    supportsReasoningEffort: false,
    supportsPlanMode: false,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (Free Models)",
    binaryKey: "aider",
    envKey: "OPENROUTER_API_KEY",
    builtInAuth: false,
    defaultModel: "deepseek/deepseek-r1:free",
    catalogModels: [
      "deepseek/deepseek-r1:free",
      "qwen/qwen3-coder:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-3-27b-it:free",
      "mistralai/mistral-small-3.2-24b-instruct:free",
    ],
    freeOnlyModels: [
      "deepseek/deepseek-r1:free",
      "qwen/qwen3-coder:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-3-27b-it:free",
      "mistralai/mistral-small-3.2-24b-instruct:free"
    ],
    supportsReasoningEffort: false,
    supportsPlanMode: false,
  }
};

export const SUPPORTED_PROVIDERS = Object.freeze(Object.keys(PROVIDER_CATALOG));

export function isSupportedProvider(providerName) {
  const normalized = String(providerName || "").trim().toLowerCase();
  return SUPPORTED_PROVIDERS.includes(normalized);
}

export function getProviderMeta(providerName) {
  const normalized = String(providerName || "").trim().toLowerCase();
  return PROVIDER_CATALOG[normalized] || null;
}

export function listProviderCatalog() {
  return SUPPORTED_PROVIDERS.map((id) => {
    const meta = PROVIDER_CATALOG[id];
    const candidates = Array.isArray(meta.catalogModels) && meta.catalogModels.length > 0
      ? meta.catalogModels
      : meta.freeOnlyModels;
    const seen = new Set();
    const models = [];
    for (const value of candidates) {
      const modelValue = String(value || "").trim();
      if (!modelValue || seen.has(modelValue)) {
        continue;
      }
      seen.add(modelValue);
      models.push({
        value: modelValue,
        label: modelValue,
        free: meta.freeOnlyModels.includes(modelValue),
      });
    }

    return {
      id: meta.id,
      label: meta.label,
      defaultModel: meta.defaultModel,
      supportsReasoningEffort: meta.supportsReasoningEffort,
      supportsPlanMode: meta.supportsPlanMode,
      models: [
        {
          value: "",
          label: "Provider default",
          free: meta.freeOnlyModels.length > 0
        },
        ...models,
      ]
    };
  });
}

export function isFreeModelAllowed({ providerName, modelName, freeModelsOnly }) {
  if (!freeModelsOnly) {
    return true;
  }

  const provider = getProviderMeta(providerName);
  if (!provider) {
    return false;
  }

  const model = String(modelName || "").trim();
  if (!model) {
    return true;
  }

  if (provider.freeOnlyModels.length === 0) {
    return true;
  }

  return provider.freeOnlyModels.includes(model);
}

export function supportedProviderText() {
  return SUPPORTED_PROVIDERS.join(", ");
}
