import { estimateTokens } from "./token-budget.mjs";

const DEFAULT_SECTION_PREVIEW_CHARS = 4000;
const DEFAULT_PROMPT_PREVIEW_CHARS = 12000;

function normalizeText(value) {
  return String(value || "").trim();
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
}

function previewText(value, maxChars) {
  const text = String(value || "");
  const safeLimit = Math.max(200, toNonNegativeInt(maxChars, DEFAULT_SECTION_PREVIEW_CHARS));
  if (text.length <= safeLimit) {
    return text;
  }
  return `${text.slice(0, safeLimit)}\n...[truncated ${text.length - safeLimit} chars]`;
}

function buildSection({
  id,
  label,
  text,
  removed = false,
  maxPreviewChars = DEFAULT_SECTION_PREVIEW_CHARS,
}) {
  const safeText = normalizeText(text);
  const chars = safeText.length;
  const estimatedTokens = estimateTokens(safeText);
  return {
    id,
    label,
    removed: Boolean(removed),
    included: !removed && chars > 0,
    chars,
    estimatedTokens,
    preview: previewText(safeText, maxPreviewChars),
  };
}

export function buildContextInspectorPayload({
  provider = "",
  model = "",
  reasoningEffort = "",
  planMode = false,
  parityMode = false,
  threadId = "",
  sessionId = "",
  tokenBudget = 0,
  remainingBudget = 0,
  autoTrimContext = true,
  userTask = "",
  bootstrapPrompt = "",
  resumeContext = "",
  threadContext = "",
  finalPrompt = "",
  removedSections = [],
  trimmed = false,
  cannotFit = false,
}) {
  const removed = new Set((Array.isArray(removedSections) ? removedSections : []).map((item) => String(item)));
  const sections = [
    buildSection({
      id: "user_task",
      label: "User task",
      text: userTask,
      removed: false,
    }),
    buildSection({
      id: "bootstrap_prompt",
      label: "Bootstrap instructions",
      text: bootstrapPrompt,
      removed: removed.has("bootstrap_prompt"),
    }),
    buildSection({
      id: "resume_context",
      label: "Resume context",
      text: resumeContext,
      removed: removed.has("resume_context"),
    }),
    buildSection({
      id: "thread_context",
      label: "Thread context",
      text: threadContext,
      removed: removed.has("thread_context"),
    }),
  ];

  const prompt = normalizeText(finalPrompt);
  const promptChars = prompt.length;
  const promptEstimatedTokens = estimateTokens(prompt);

  return {
    provider: String(provider || ""),
    model: String(model || ""),
    reasoningEffort: String(reasoningEffort || ""),
    planMode: Boolean(planMode),
    parityMode: Boolean(parityMode),
    threadId: String(threadId || ""),
    sessionId: String(sessionId || ""),
    tokenBudget: toNonNegativeInt(tokenBudget, 0),
    remainingBudget: toNonNegativeInt(remainingBudget, 0),
    autoTrimContext: Boolean(autoTrimContext),
    trimmed: Boolean(trimmed),
    cannotFit: Boolean(cannotFit),
    removedSections: Array.from(removed),
    promptChars,
    promptEstimatedTokens,
    promptPreview: previewText(prompt, DEFAULT_PROMPT_PREVIEW_CHARS),
    sections,
  };
}
