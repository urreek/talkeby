import { getProviderMeta, isSupportedProvider } from "../providers/catalog.mjs";

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value) {
  return textValue(value).toLowerCase();
}

function resolveModelForProvider(providerName, modelName) {
  const normalizedProvider = normalizeProvider(providerName);
  const normalizedModel = textValue(modelName);
  if (normalizedModel) {
    return normalizedModel;
  }
  return getProviderMeta(normalizedProvider)?.defaultModel || "";
}

function latestThreadProvider(repository, threadId) {
  if (!repository || !threadId || typeof repository.listJobsByThread !== "function") {
    return "";
  }

  const jobs = repository.listJobsByThread(threadId, 5000);
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const provider = normalizeProvider(jobs[index]?.provider);
    if (isSupportedProvider(provider)) {
      return provider;
    }
  }
  return "";
}

export function resolveThreadProviderPreferences({
  repository,
  thread,
  state,
}) {
  const currentProvider = normalizeProvider(state?.getProvider?.() || "codex") || "codex";
  const currentModel = textValue(state?.getModel?.() || "");
  const currentReasoningEffort = textValue(state?.getReasoningEffort?.() || "").toLowerCase() || "medium";

  const savedProvider = normalizeProvider(thread?.lastProvider);
  const provider = isSupportedProvider(savedProvider)
    ? savedProvider
    : (latestThreadProvider(repository, thread?.id) || currentProvider);

  const savedModel = textValue(thread?.lastModel);
  const savedReasoningEffort = textValue(thread?.lastReasoningEffort).toLowerCase();

  const model = resolveModelForProvider(
    provider,
    savedModel || (provider === currentProvider ? currentModel : ""),
  );
  const reasoningEffort = savedReasoningEffort || (provider === currentProvider ? currentReasoningEffort : "");

  return {
    provider,
    model,
    reasoningEffort,
  };
}

export function buildThreadProviderPreferencePatch({
  provider,
  model,
  reasoningEffort,
}) {
  const normalizedProvider = normalizeProvider(provider);
  if (!isSupportedProvider(normalizedProvider)) {
    return {};
  }

  return {
    lastProvider: normalizedProvider,
    lastModel: resolveModelForProvider(normalizedProvider, model),
    lastReasoningEffort: textValue(reasoningEffort).toLowerCase() || "medium",
  };
}
