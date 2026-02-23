function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SAFE_COMMAND_PATTERNS = [
  /^pwd(?:\s|$)/i,
  /^ls(?:\s|$)/i,
  /^cat(?:\s|$)/i,
  /^head(?:\s|$)/i,
  /^tail(?:\s|$)/i,
  /^echo(?:\s|$)/i,
  /^find(?:\s|$)/i,
  /^rg(?:\s|$)/i,
  /^grep(?:\s|$)/i,
  /^sed(?:\s|$)/i,
  /^awk(?:\s|$)/i,
  /^git\s+(status|diff|show|log|branch)(?:\s|$)/i,
  /^(npm|pnpm|yarn|bun)\s+run\s+(test|lint|typecheck|build)(?:\s|$)/i,
  /^(npm|pnpm|yarn|bun)\s+test(?:\s|$)/i,
  /^node\s+--check(?:\s|$)/i,
];

const RISKY_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsudo\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bnc\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /(^|\s)(npm|pnpm|yarn|bun)\s+(install|add|remove|upgrade|update)\b/i,
  /\bpip(?:3)?\s+install\b/i,
  /\bbrew\s+install\b/i,
  /\bapt(?:-get)?\s+(install|remove|upgrade)\b/i,
  /\bgit\s+(commit|push|pull|merge|rebase|reset|checkout|tag|cherry-pick)\b/i,
  /\bdocker\s+(build|run|push|pull|exec)\b/i,
];

function classifyCommandRisk(command) {
  const normalized = normalizeWhitespace(command);
  if (!normalized) {
    return {
      decision: "ask",
      riskLevel: "medium",
      rule: "empty_command",
    };
  }

  if (RISKY_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      decision: "ask",
      riskLevel: "high",
      rule: "risky_command",
    };
  }

  if (SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      decision: "approve",
      riskLevel: "low",
      rule: "safe_command",
    };
  }

  return {
    decision: "ask",
    riskLevel: "medium",
    rule: "unknown_command",
  };
}

function buildSummary(request) {
  if (request.kind === "command") {
    const command = normalizeWhitespace(request.command || "");
    return command ? `Run command: ${command}` : "Run shell command";
  }
  if (request.kind === "file_change") {
    return "Apply file changes";
  }
  return "Runtime approval requested";
}

export function evaluateRuntimeApprovalRequest(request) {
  const kind = textValue(request?.kind || "");
  const command = normalizeWhitespace(request?.command || "");

  if (kind === "command") {
    const commandRisk = classifyCommandRisk(command);
    return {
      decision: commandRisk.decision,
      requiresApproval: commandRisk.decision !== "approve",
      riskLevel: commandRisk.riskLevel,
      policyRule: commandRisk.rule,
      summary: buildSummary(request),
    };
  }

  if (kind === "file_change") {
    return {
      decision: "ask",
      requiresApproval: true,
      riskLevel: "high",
      policyRule: "file_change_requires_approval",
      summary: buildSummary(request),
    };
  }

  return {
    decision: "ask",
    requiresApproval: true,
    riskLevel: "high",
    policyRule: "unknown_runtime_request",
    summary: buildSummary(request),
  };
}

export function formatRuntimeApprovalDetails(record) {
  const lines = [
    `Runtime approval needed (${record.riskLevel}).`,
    `Job: ${record.jobId}`,
    `Type: ${record.kind}`,
    `Summary: ${record.summary}`,
  ];

  if (record.command) {
    lines.push(`Command: ${record.command}`);
  }
  if (record.cwd) {
    lines.push(`CWD: ${record.cwd}`);
  }
  if (record.reason) {
    lines.push(`Reason: ${record.reason}`);
  }

  lines.push("Open the web app to approve or deny.");
  return lines.join("\n");
}
