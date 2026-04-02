const SANDBOX_OPTIONS = [
  {
    value: "read-only",
    label: "Read-only",
    description: "Agent can inspect files but should not modify the workspace.",
    riskLevel: "low",
  },
  {
    value: "workspace-write",
    label: "Workspace write",
    description: "Agent can modify files inside the project workspace only.",
    riskLevel: "medium",
  },
  {
    value: "danger-full-access",
    label: "Danger full access",
    description: "Agent can run with broad machine access. Use only on trusted machines.",
    riskLevel: "high",
  },
];

export function listSandboxOptions() {
  return SANDBOX_OPTIONS.map((option) => ({ ...option }));
}

export function getSandboxOption(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SANDBOX_OPTIONS.find((option) => option.value === normalized) || null;
}

export function parseSandboxMode(value, fallback = "workspace-write") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  const option = getSandboxOption(normalized);
  if (!option) {
    throw new Error(
      `Invalid CODEX_SANDBOX_MODE "${value}". Use ${SANDBOX_OPTIONS.map((entry) => `"${entry.value}"`).join(", ")}.`,
    );
  }

  return option.value;
}

export function buildSandboxDoctorCheck({
  sandboxMode,
  executionMode,
}) {
  const option = getSandboxOption(sandboxMode) || getSandboxOption("workspace-write");
  const mode = String(executionMode || "").trim().toLowerCase();

  if (!option) {
    return {
      id: "codex_sandbox_mode",
      ok: false,
      severity: "error",
      message: "Codex sandbox mode is invalid.",
      fix: "Set CODEX_SANDBOX_MODE to read-only, workspace-write, or danger-full-access.",
    };
  }

  if (option.value === "danger-full-access") {
    return {
      id: "codex_sandbox_mode",
      ok: false,
      severity: mode === "interactive" ? "warning" : "error",
      message: mode === "interactive"
        ? "Codex sandbox mode is danger-full-access. Interactive approval is strongly recommended."
        : "Codex sandbox mode is danger-full-access while execution mode is auto.",
      fix: mode === "interactive"
        ? "Prefer workspace-write unless you explicitly need host-wide access."
        : "Switch to interactive mode or set CODEX_SANDBOX_MODE=workspace-write.",
    };
  }

  return {
    id: "codex_sandbox_mode",
    ok: true,
    severity: "info",
    message: `Codex sandbox mode: ${option.value}. ${option.description}`,
    fix: "",
  };
}
