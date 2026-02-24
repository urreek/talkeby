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
  autoTrimContext = true,
}) {
  const fullPrompt = composePrompt({
    userTask,
    bootstrapPrompt,
    resumeContext,
    threadContext,
  });
  const fullTokens = estimateTokens(fullPrompt);
  if (!remainingBudget || remainingBudget <= 0 || fullTokens <= remainingBudget) {
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

  const removed = [];
  let nextPrompt = composePrompt({
    userTask,
    bootstrapPrompt,
    resumeContext: "",
    threadContext,
  });
  let tokens = estimateTokens(nextPrompt);
  if (tokens <= remainingBudget) {
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
  if (tokens <= remainingBudget) {
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
