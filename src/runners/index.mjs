import { run as runCodex } from "./codex.mjs";
import { run as runClaude } from "./claude.mjs";
import { run as runGemini } from "./gemini.mjs";

const runners = {
  codex: runCodex,
  claude: runClaude,
  gemini: runGemini,
};

export const SUPPORTED_PROVIDERS = Object.keys(runners);

/**
 * Resolve a provider name to its runner function.
 * @param {string} providerName - "codex", "claude", or "gemini"
 * @returns {(config: { task: string, workdir: string, model: string, timeoutMs: number, binary: string }) => Promise<{ message: string }>}
 */
export function getRunner(providerName) {
  const normalized = String(providerName || "").trim().toLowerCase();
  const runner = runners[normalized];
  if (!runner) {
    throw new Error(
      `Unknown AI provider "${providerName}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }
  return runner;
}
