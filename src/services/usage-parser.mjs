function toInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function usageRecord({
  source,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  cachedInputTokens = 0,
  reasoningOutputTokens = 0,
  costUsd = null,
  raw = null,
}) {
  return {
    source,
    inputTokens: Math.max(0, toInt(inputTokens)),
    outputTokens: Math.max(0, toInt(outputTokens)),
    totalTokens: Math.max(0, toInt(totalTokens)),
    cachedInputTokens: Math.max(0, toInt(cachedInputTokens)),
    reasoningOutputTokens: Math.max(0, toInt(reasoningOutputTokens)),
    costUsd: costUsd === null ? null : toNumber(costUsd),
    raw,
  };
}

export function extractCodexUsageFromEvent(event) {
  if (!event?.tokenUsage) {
    return null;
  }
  const last = event.tokenUsage.last || event.tokenUsage.total || {};
  return usageRecord({
    source: "exact",
    inputTokens: last.inputTokens,
    outputTokens: last.outputTokens,
    totalTokens: last.totalTokens,
    cachedInputTokens: last.cachedInputTokens,
    reasoningOutputTokens: last.reasoningOutputTokens,
    raw: event.tokenUsage,
  });
}

export function extractGeminiUsageFromJsonPayload(payload) {
  const stats = payload?.stats || {};
  if (stats && typeof stats.total_tokens === "number") {
    return usageRecord({
      source: "exact",
      inputTokens: stats.input_tokens || 0,
      outputTokens: stats.output_tokens || 0,
      totalTokens: stats.total_tokens || 0,
      raw: stats,
    });
  }

  const models = stats?.models || {};
  let input = 0;
  let output = 0;
  let total = 0;
  let cached = 0;
  let reasoning = 0;
  const modelKeys = Object.keys(models);
  if (modelKeys.length === 0) {
    return null;
  }
  for (const key of modelKeys) {
    const tokens = models[key]?.tokens || {};
    input += toInt(tokens.prompt);
    total += toInt(tokens.total);
    cached += toInt(tokens.cached);
    reasoning += toInt(tokens.thoughts);
    output += toInt(tokens.candidates) + toInt(tokens.tool);
  }
  if (total <= 0 && input <= 0 && output <= 0) {
    return null;
  }
  return usageRecord({
    source: "exact",
    inputTokens: input,
    outputTokens: output,
    totalTokens: total > 0 ? total : input + output,
    cachedInputTokens: cached,
    reasoningOutputTokens: reasoning,
    raw: stats,
  });
}

export function extractClaudeUsageFromJsonPayload(payload) {
  const usage = payload?.usage || payload?.stats?.usage || payload?.stats?.tokens || {};
  const input = toInt(usage.input_tokens || usage.inputTokens || usage.prompt_tokens || usage.promptTokens);
  const output = toInt(usage.output_tokens || usage.outputTokens || usage.completion_tokens || usage.completionTokens);
  const total = toInt(usage.total_tokens || usage.totalTokens || input + output);
  if (input <= 0 && output <= 0 && total <= 0) {
    return null;
  }
  return usageRecord({
    source: "exact",
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    cachedInputTokens: toInt(usage.cached_input_tokens || usage.cachedInputTokens),
    reasoningOutputTokens: toInt(usage.reasoning_output_tokens || usage.reasoningOutputTokens),
    costUsd: payload?.cost_usd || payload?.costUsd || payload?.stats?.costUsd || null,
    raw: payload,
  });
}

