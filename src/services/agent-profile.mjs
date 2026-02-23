const MAX_PROFILE_LENGTH = 1200;

const DEFAULT_THREAD_BOOTSTRAP_PROFILE = [
  "Execute only what the user requested.",
  "Keep output minimal.",
  "Final response must be exactly one line:",
  "- DONE: <short result>",
  "If blocked, use:",
  "- BLOCKED: <short reason and missing input/dependency>",
  "Do not include long explanations unless asked.",
].join("\n");

function normalizeText(value) {
  return String(value || "").trim();
}

function clampProfile(text) {
  if (text.length <= MAX_PROFILE_LENGTH) {
    return text;
  }
  return text.slice(0, MAX_PROFILE_LENGTH).trim();
}

export function getDefaultAgentProfile() {
  return DEFAULT_THREAD_BOOTSTRAP_PROFILE;
}

export function normalizeAgentProfileInput(value) {
  return clampProfile(normalizeText(value));
}

export function resolveAgentProfile(value) {
  const normalized = normalizeAgentProfileInput(value);
  return normalized || DEFAULT_THREAD_BOOTSTRAP_PROFILE;
}

export function buildFirstTurnPrompt({ bootstrap, userTask }) {
  const profile = normalizeAgentProfileInput(bootstrap);
  const task = normalizeText(userTask);
  if (!profile) {
    return task;
  }
  if (!task) {
    return profile;
  }
  return `${profile}\n\nUser task:\n${task}`;
}

