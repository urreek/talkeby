import { readCodexSubscription } from "../providers/codex-subscription.mjs";

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWindow(window) {
  if (!window || typeof window !== "object") return null;
  const used = numberOrNull(window.usedPercent);
  const reset = numberOrNull(window.resetsAt);
  const date = reset !== null && reset > 0 ? new Date(reset * 1000) : null;
  return {
    remainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
    windowDurationMins: numberOrNull(window.windowDurationMins),
    resetsAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
  };
}

export function normalizeSubscriptionLimits(payload) {
  const map = payload?.rateLimitsByLimitId;
  const buckets = map && typeof map === "object" && !Array.isArray(map) && Object.keys(map).length
    ? Object.entries(map) : [["codex", payload?.rateLimits]];
  return buckets.filter(([, bucket]) => bucket && typeof bucket === "object").slice(0, 20).map(([key, bucket]) => ({
    name: typeof bucket.limitName === "string" ? bucket.limitName.slice(0, 100) : key.slice(0, 100),
    plan: typeof bucket.planType === "string" ? bucket.planType.slice(0, 100) : null,
    primary: normalizeWindow(bucket.primary),
    secondary: normalizeWindow(bucket.secondary),
  }));
}

export function createSubscriptionUsageService({ config, readLimits = readCodexSubscription, now = Date.now }) {
  let cached = null;
  let cachedAt = 0;
  let pending = null;
  async function load() {
    let result;
    try {
      const limits = normalizeSubscriptionLimits(await readLimits(config.codex));
      const available = limits.some((bucket) => [bucket.primary, bucket.secondary].some((window) => window?.remainingPercent !== null && window?.remainingPercent !== undefined));
      result = { status: available ? "available" : "unavailable", message: available ? "" : "Subscription limits were not returned. Sign in to Codex with your ChatGPT subscription.", limits };
    } catch {
      result = { status: "unavailable", message: "Could not read subscription limits. Check Codex sign-in and try again.", limits: [] };
    }
    cachedAt = now();
    cached = { provider: "codex", ...result, checkedAt: new Date(cachedAt).toISOString() };
    return cached;
  }
  return {
    async get(provider, refresh = false) {
      if (provider !== "codex") return {
        provider, status: "unsupported", checkedAt: null, limits: [],
        message: provider === "claude" ? "Check your Claude subscription in its usage dashboard or run /usage in Claude Code." : "Subscription usage is not available for this provider.",
      };
      if (pending) return pending;
      if (cached && now() - cachedAt < (refresh ? 5_000 : 30_000)) return cached;
      pending = load().finally(() => { pending = null; });
      return pending;
    },
  };
}
