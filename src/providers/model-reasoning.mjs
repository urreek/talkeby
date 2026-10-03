const STANDARD_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function effort(levels, defaultReasoningEffort) {
  return {
    supportsReasoningEffort: true,
    reasoningEfforts: levels.map((value) => ({ value, label: value })),
    defaultReasoningEffort,
  };
}

// CLI-compatible fallback capabilities; live discovery takes precedence.
const MODEL_REASONING = {
  codex: {
    "gpt-6.1-sol": effort(STANDARD_LEVELS, "medium"),
    "gpt-6-astra": effort(STANDARD_LEVELS, "low"),
    "gpt-6-luna": effort(["none", ...STANDARD_LEVELS], "high"),
    "gpt-6-sol": effort(STANDARD_LEVELS, "medium"),
  },
  claude: {
    "claude-sonnet-5-5": effort(STANDARD_LEVELS, "medium"),
    "claude-opus-5-5": effort(STANDARD_LEVELS, "medium"),
    "claude-fable-5-1": effort(STANDARD_LEVELS, "high"),
    "claude-haiku-4-5": { supportsReasoningEffort: false },
    "claude-haiku-4-5-20251001": { supportsReasoningEffort: false },
  },
};

export function getModelReasoningMetadata(providerId, modelName) {
  return MODEL_REASONING[providerId]?.[modelName] || {};
}
