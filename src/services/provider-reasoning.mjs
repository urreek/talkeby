function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReasoningOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const option of options) {
    const value = textValue(option?.value || option?.reasoningEffort || "").toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push({
      value,
      label: textValue(option?.label || option?.reasoningEffort || value) || value,
      description: textValue(option?.description || ""),
    });
  }
  return normalized;
}

function findProvider(providerCatalog, providerId) {
  const normalizedProviderId = textValue(providerId).toLowerCase();
  if (!normalizedProviderId || !Array.isArray(providerCatalog)) {
    return null;
  }
  return providerCatalog.find((provider) => textValue(provider?.id).toLowerCase() === normalizedProviderId) || null;
}

function findModel(provider, modelName) {
  if (!provider) {
    return null;
  }

  const requestedModel = textValue(modelName);
  const resolvedModel = requestedModel || textValue(provider.defaultModel || "");
  if (!resolvedModel) {
    return null;
  }

  return provider.models.find((model) => textValue(model?.value) === resolvedModel) || null;
}

function fallbackReasoningOptions(provider) {
  if (!provider) {
    return [];
  }

  const providerLevelOptions = normalizeReasoningOptions(provider.reasoningEfforts);
  if (providerLevelOptions.length > 0) {
    return providerLevelOptions;
  }

  if (textValue(provider.id).toLowerCase() === "codex") {
    return [];
  }

  return [
    { value: "low", label: "low", description: "" },
    { value: "medium", label: "medium", description: "" },
    { value: "high", label: "high", description: "" },
  ];
}

function resolveDefaultReasoningEffort(defaultReasoningEffort, options) {
  const normalizedDefault = textValue(defaultReasoningEffort).toLowerCase();
  if (normalizedDefault) {
    if (options.length === 0 || options.some((option) => option.value === normalizedDefault)) {
      return normalizedDefault;
    }
  }

  if (options.some((option) => option.value === "medium")) {
    return "medium";
  }

  return options[0]?.value || normalizedDefault || "";
}

export function getProviderReasoningConfig({
  providerCatalog,
  providerId,
  modelName,
}) {
  const provider = findProvider(providerCatalog, providerId);
  const supportsReasoning = Boolean(provider?.supportsReasoningEffort);
  if (!supportsReasoning) {
    return {
      supportsReasoning: false,
      provider: provider || null,
      model: null,
      options: [],
      defaultReasoningEffort: "",
    };
  }

  const model = findModel(provider, modelName);
  const options = normalizeReasoningOptions(model?.reasoningEfforts);
  const resolvedOptions = options.length > 0 ? options : fallbackReasoningOptions(provider);
  const defaultReasoningEffort = resolveDefaultReasoningEffort(
    model?.defaultReasoningEffort || provider?.defaultReasoningEffort,
    resolvedOptions,
  );

  return {
    supportsReasoning: true,
    provider,
    model,
    options: resolvedOptions,
    defaultReasoningEffort,
  };
}

export function resolveProviderReasoningEffort({
  providerCatalog,
  providerId,
  modelName,
  currentEffort,
}) {
  const config = getProviderReasoningConfig({
    providerCatalog,
    providerId,
    modelName,
  });
  if (!config.supportsReasoning) {
    return "";
  }

  const normalizedCurrent = textValue(currentEffort).toLowerCase();
  if (config.options.length === 0) {
    return normalizedCurrent || config.defaultReasoningEffort || "";
  }
  if (config.options.some((option) => option.value === normalizedCurrent)) {
    return normalizedCurrent;
  }
  return config.defaultReasoningEffort;
}
