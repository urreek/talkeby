import type {
  ProviderCatalogItem,
  ProviderCatalogModel,
  ProviderReasoningOption,
  ReasoningEffort,
} from "@/lib/types";

const GENERIC_REASONING_OPTIONS: ProviderReasoningOption[] = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
];

function normalizeModelValue(modelValue: string) {
  const normalized = String(modelValue || "").trim();
  if (!normalized || normalized === "__default__") {
    return "";
  }
  return normalized;
}

function normalizeReasoningOptions(options?: ProviderReasoningOption[]) {
  if (!Array.isArray(options)) {
    return [] as ProviderReasoningOption[];
  }

  const seen = new Set<string>();
  const normalized: ProviderReasoningOption[] = [];
  for (const option of options) {
    const value = String(option?.value || "").trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push({
      value,
      label: String(option?.label || value).trim() || value,
      description: option?.description,
    });
  }
  return normalized;
}

function findReasoningModel(provider: ProviderCatalogItem | undefined, modelValue: string) {
  if (!provider) {
    return null;
  }

  const resolvedModelValue = normalizeModelValue(modelValue) || provider.defaultModel || "";
  if (!resolvedModelValue) {
    return null;
  }

  return provider.models.find((model) => model.value === resolvedModelValue) || null;
}

function fallbackReasoningOptions(provider: ProviderCatalogItem | undefined) {
  if (!provider) {
    return [] as ProviderReasoningOption[];
  }

  const providerLevelOptions = normalizeReasoningOptions(provider.reasoningEfforts);
  if (providerLevelOptions.length > 0) {
    return providerLevelOptions;
  }

  if (provider.id === "codex") {
    return [] as ProviderReasoningOption[];
  }
  return GENERIC_REASONING_OPTIONS;
}

function resolveDefaultReasoningEffort(
  defaultReasoningEffort: string | undefined,
  options: ProviderReasoningOption[],
) {
  const normalizedDefault = String(defaultReasoningEffort || "").trim().toLowerCase();
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

export function getReasoningConfig(provider: ProviderCatalogItem | undefined, modelValue: string) {
  const supportsReasoning = Boolean(provider?.supportsReasoningEffort);
  if (!supportsReasoning) {
    return {
      supportsReasoning: false,
      canSelectReasoning: false,
      options: [] as ProviderReasoningOption[],
      defaultReasoningEffort: "",
      model: null as ProviderCatalogModel | null,
    };
  }

  const model = findReasoningModel(provider, modelValue);
  const dynamicOptions = normalizeReasoningOptions(model?.reasoningEfforts);
  const options = dynamicOptions.length > 0
    ? dynamicOptions
    : fallbackReasoningOptions(provider);
  const defaultReasoningEffort = resolveDefaultReasoningEffort(
    model?.defaultReasoningEffort || provider?.defaultReasoningEffort,
    options,
  );

  return {
    supportsReasoning: true,
    canSelectReasoning: options.length > 0,
    options,
    defaultReasoningEffort,
    model,
  };
}

export function resolveReasoningEffort(
  provider: ProviderCatalogItem | undefined,
  modelValue: string,
  currentValue: string,
): ReasoningEffort {
  const config = getReasoningConfig(provider, modelValue);
  if (!config.supportsReasoning) {
    return "";
  }

  const normalized = String(currentValue || "").trim().toLowerCase();
  if (config.options.length === 0) {
    return normalized || config.defaultReasoningEffort;
  }
  if (config.options.some((option) => option.value === normalized)) {
    return normalized;
  }

  return config.defaultReasoningEffort;
}
