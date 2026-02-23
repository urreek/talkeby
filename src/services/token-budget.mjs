export function estimateTokens(value) {
  const text = String(value || "");
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

