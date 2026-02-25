import { estimateTokens } from "./token-budget.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

function section(title, body) {
  const value = normalizeText(body);
  if (!value) {
    return "";
  }
  return `${title}\n${value}`;
}

function composePrompt({
  userTask,
  bootstrapPrompt = "",
  resumeContext = "",
  threadContext = "",
}) {
  const parts = [];
  const bootstrap = section("Bootstrap instructions:", bootstrapPrompt);
  const resume = section("Previous error context:", resumeContext);
  const history = section("Thread context:", threadContext);
  const task = section("User task:", userTask);
  if (bootstrap) parts.push(bootstrap);
  if (resume) parts.push(resume);
  if (history) parts.push(history);
  if (task) parts.push(task);
  return normalizeText(parts.join("\n\n"));
}

export function buildBudgetAwarePrompt({
  userTask,
  bootstrapPrompt = "",
  resumeContext = "",
  threadContext = "",
  remainingBudget = 0,
  budgetEnabled = true,
  autoTrimContext = true,
}) {
  const fullPrompt = composePrompt({
    userTask,
    bootstrapPrompt,
    resumeContext,
    threadContext,
  });
  const fullTokens = estimateTokens(fullPrompt);
  const numericBudget = Number.parseInt(String(remainingBudget || 0), 10);
  const safeRemainingBudget = Number.isFinite(numericBudget) ? Math.max(0, numericBudget) : 0;
  if (!budgetEnabled) {
    return {
      prompt: fullPrompt,
      trimmed: false,
      removed: [],
      estimatedTokens: fullTokens,
    };
  }
  if (safeRemainingBudget > 0 && fullTokens <= safeRemainingBudget) {
    return {
      prompt: fullPrompt,
      trimmed: false,
      removed: [],
      estimatedTokens: fullTokens,
    };
  }

  if (!autoTrimContext) {
    return {
      prompt: fullPrompt,
      trimmed: false,
      removed: [],
      estimatedTokens: fullTokens,
      cannotFit: true,
    };
  }

  if (safeRemainingBudget <= 0) {
    const minimalPrompt = composePrompt({
      userTask,
      bootstrapPrompt: "",
      resumeContext: "",
      threadContext: "",
    });
    const removed = [];
    if (normalizeText(resumeContext)) {
      removed.push("resume_context");
    }
    if (normalizeText(bootstrapPrompt)) {
      removed.push("bootstrap_prompt");
    }
    if (normalizeText(threadContext)) {
      removed.push("thread_context");
    }
    return {
      prompt: minimalPrompt,
      trimmed: removed.length > 0,
      removed,
      estimatedTokens: estimateTokens(minimalPrompt),
      cannotFit: true,
    };
  }

  const removed = [];
  let nextPrompt = composePrompt({
    userTask,
    bootstrapPrompt,
    resumeContext: "",
    threadContext,
  });
  let tokens = estimateTokens(nextPrompt);
  if (tokens <= safeRemainingBudget) {
    removed.push("resume_context");
    return {
      prompt: nextPrompt,
      trimmed: true,
      removed,
      estimatedTokens: tokens,
    };
  }

  nextPrompt = composePrompt({
    userTask,
    bootstrapPrompt: "",
    resumeContext: "",
    threadContext,
  });
  tokens = estimateTokens(nextPrompt);
  removed.push("resume_context", "bootstrap_prompt");
  if (tokens <= safeRemainingBudget) {
    return {
      prompt: nextPrompt,
      trimmed: true,
      removed,
      estimatedTokens: tokens,
    };
  }

  nextPrompt = composePrompt({
    userTask,
    bootstrapPrompt: "",
    resumeContext: "",
    threadContext: "",
  });
  tokens = estimateTokens(nextPrompt);
  removed.push("thread_context");

  return {
    prompt: nextPrompt,
    trimmed: true,
    removed,
    estimatedTokens: tokens,
    cannotFit: true,
  };
}
