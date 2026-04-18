import { getProviderMeta, SUPPORTED_PROVIDERS } from "../providers/catalog.mjs";
import {
  countPriorProviderContinuityTurns,
  getLatestPriorProvider,
  isFinalizedThreadJob,
  normalizeProvider,
  providerLabel,
  supportsNativeProviderSessions,
} from "./provider-thread-continuity.mjs";

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function latestJobStatus(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return null;
  }
  return textValue(jobs.at(-1)?.status || "") || null;
}

function resolveContextMode({
  activeProvider,
  supportsNative,
  hasPriorVisibleHistory,
  latestProvider,
  providerContinuityTurns,
  session,
}) {
  if (!hasPriorVisibleHistory) {
    return {
      mode: "fresh_context",
      label: "Fresh context",
      description: "This thread has no prior visible job history.",
    };
  }

  if (!supportsNative) {
    return {
      mode: "managed_thread_context",
      label: "Managed thread context",
      description: "Talkeby will inject compact thread history because this provider has no native session resume.",
    };
  }

  if (session?.sessionId) {
    return {
      mode: "native_resume",
      label: "Native resume",
      description: `${providerLabel(activeProvider)} has a saved native session for this thread.`,
    };
  }

  if (latestProvider && latestProvider !== activeProvider) {
    return {
      mode: "compact_provider_handoff",
      label: "Compact provider handoff",
      description: `Next run will bootstrap compact context from ${providerLabel(latestProvider)} into ${providerLabel(activeProvider)}.`,
    };
  }

  if (!latestProvider && providerContinuityTurns === 0) {
    return {
      mode: "compact_provider_handoff",
      label: "Compact provider handoff",
      description: "Prior history has no provider metadata, so Talkeby will bootstrap compact context for the active provider.",
    };
  }

  if (providerContinuityTurns > 0) {
    return {
      mode: "missing_native_session",
      label: "Missing native session",
      description: `${providerLabel(activeProvider)} has prior completed history in this thread but no saved native session.`,
    };
  }

  return {
    mode: "fresh_context",
    label: "Fresh context",
    description: `${providerLabel(activeProvider)} has no resumable native context for this thread yet.`,
  };
}

function serializeProviderSession({ repository, threadId, provider, activeProvider }) {
  const supported = supportsNativeProviderSessions(provider);
  const session = supported
    ? repository.getThreadProviderSession(threadId, provider)
    : null;
  const hasSession = Boolean(session?.sessionId);

  return {
    provider,
    label: providerLabel(provider),
    active: provider === activeProvider,
    nativeSessionsSupported: supported,
    status: supported
      ? (hasSession ? "active" : "missing")
      : "not_supported",
    hasSession,
    syncedJobId: textValue(session?.syncedJobId || ""),
    updatedAt: textValue(session?.updatedAt || ""),
  };
}

export function buildThreadMemoryInspector({
  repository,
  threadId,
  activeProvider = "",
  activeModel = "",
  workspacePath = "",
}) {
  if (!repository || !threadId || typeof repository.getThread !== "function") {
    return null;
  }

  const thread = repository.getThread(threadId);
  if (!thread) {
    return null;
  }

  const provider = normalizeProvider(activeProvider || thread.lastProvider || "") || "codex";
  const jobs = typeof repository.listJobsByThread === "function"
    ? repository.listJobsByThread(threadId, 5000)
    : [];
  const latestProvider = getLatestPriorProvider(jobs);
  const lastProvider = normalizeProvider(thread.lastProvider || latestProvider || "");
  const supportsNative = supportsNativeProviderSessions(provider);
  const providerContinuityTurns = countPriorProviderContinuityTurns(jobs, {
    provider,
    legacyFallbackProvider: provider === "codex" ? provider : "",
  });
  const hasPriorVisibleHistory = jobs.some((job) => isFinalizedThreadJob(job));
  const currentSession = supportsNative
    ? repository.getThreadProviderSession(threadId, provider)
    : null;
  const context = resolveContextMode({
    activeProvider: provider,
    supportsNative,
    hasPriorVisibleHistory,
    latestProvider,
    providerContinuityTurns,
    session: currentSession,
  });
  const tokenBudget = toNonNegativeInt(thread.tokenBudget);
  const tokenUsed = toNonNegativeInt(thread.tokenUsed);

  return {
    threadId: thread.id,
    projectName: thread.projectName,
    workspacePath: textValue(workspacePath),
    currentProvider: {
      id: provider,
      label: providerLabel(provider),
      model: textValue(activeModel || thread.lastModel || getProviderMeta(provider)?.defaultModel || ""),
    },
    lastProvider: lastProvider
      ? {
          id: lastProvider,
          label: providerLabel(lastProvider),
        }
      : null,
    latestJobProvider: latestProvider
      ? {
          id: latestProvider,
          label: providerLabel(latestProvider),
        }
      : null,
    context,
    nativeSessions: SUPPORTED_PROVIDERS.map((providerId) =>
      serializeProviderSession({
        repository,
        threadId,
        provider: providerId,
        activeProvider: provider,
      })),
    history: {
      hasPriorVisibleHistory,
      latestJobStatus: latestJobStatus(jobs),
      visibleTurns: jobs.filter((job) => isFinalizedThreadJob(job)).length,
      activeProviderCompletedTurns: providerContinuityTurns,
    },
    tokenBudget: {
      autoTrimContext: thread.autoTrimContext !== 0,
      budget: tokenBudget,
      used: tokenUsed,
      remaining: Math.max(0, tokenBudget - tokenUsed),
      percentUsed: tokenBudget > 0 ? Math.min(100, Math.round((tokenUsed / tokenBudget) * 100)) : 0,
    },
    updatedAt: textValue(thread.updatedAt || ""),
  };
}
