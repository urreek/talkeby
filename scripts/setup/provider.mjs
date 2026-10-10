export function checkProviderConfiguration(env) {
  const provider = env.AI_PROVIDER.toLowerCase();
  const binaryKey = { codex: "CODEX_BINARY", claude: "CLAUDE_BINARY", gemini: "GEMINI_BINARY",
    copilot: "COPILOT_BINARY", groq: "AIDER_BINARY", openrouter: "AIDER_BINARY" }[provider];
  if (!binaryKey) throw new Error("AI_PROVIDER is unsupported. Choose a provider listed in .env.example.");
  if (provider === "codex" && !/^(false|0|no|off)$/i.test(env.CODEX_PARITY_MODE || "")
    && /^(true|1|yes|on)$/i.test(env.RUNTIME_POLICY_ENABLED || "")) {
    throw new Error("Native Codex continuity requires RUNTIME_POLICY_ENABLED=false in .env. Your existing setting was preserved.");
  }
  return { provider, binaryKey, configuredBinary: env[binaryKey] || (provider === "groq" || provider === "openrouter" ? "aider" : provider) };
}

export function requireSuccess(result, action) {
  if (result.status !== 0) throw new Error(`${action} failed. See the command output above, then rerun npm run setup.`);
}

export function prepareProvider({ config, rootDir, interactive, run, locate, log, env }) {
  const { provider, binaryKey, configuredBinary } = config;
  const options = { cwd: rootDir, env: { ...env, ...process.env } };
  let binary = locate(configuredBinary, rootDir);
  if (!binary && provider === "codex" && configuredBinary === "codex") {
    log("Installing Codex CLI...");
    requireSuccess(run("npm", ["install", "--global", "@openai/codex"], { cwd: rootDir }), "Codex installation");
    binary = locate("codex", rootDir);
  }
  if (!binary) throw new Error(`Install ${provider}'s CLI or correct ${binaryKey} in .env, then rerun setup.`);
  if (provider !== "codex") return;
  const status = run(binary, ["login", "status"], { ...options, stdio: "pipe" });
  if (status.status === 0) return;
  if (!interactive) throw new Error("Codex sign-in is required. Run codex login in a terminal, then rerun npm run setup.");
  log("Sign in to Codex to continue...");
  requireSuccess(run(binary, ["login"], options), "Codex sign-in");
  requireSuccess(run(binary, ["login", "status"], { ...options, stdio: "pipe" }), "Codex authentication check");
}
