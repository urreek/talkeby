function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveExecutionMode(inputMode) {
  const normalized = textValue(inputMode).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "auto" || normalized === "interactive") {
    return normalized;
  }
  return "";
}

function removeCommandPin(message, commandPin) {
  if (!commandPin) {
    return { ok: true, value: message };
  }

  const normalized = String(message || "").trim();
  const escaped = commandPin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?::|\\s+)`, "i");
  if (!pattern.test(normalized)) {
    return { ok: false, value: "" };
  }

  return {
    ok: true,
    value: normalized.replace(pattern, "").trim(),
  };
}

function parseSlashCommand(message) {
  const match = /^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i.exec(message);
  if (!match) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    args: textValue(match[2] || ""),
  };
}

function firstWord(input) {
  return textValue(input.split(/\s+/)[0] || "");
}

export function parseCommand(rawMessage, commandPin) {
  const pinResult = removeCommandPin(rawMessage, commandPin);
  if (!pinResult.ok) {
    return { type: "pin_error" };
  }

  const message = textValue(pinResult.value);
  if (!message) {
    return { type: "help" };
  }

  const slash = parseSlashCommand(message);
  if (slash) {
    if (slash.command === "start" || slash.command === "help" || slash.command === "menu") {
      return { type: "help" };
    }
    if (slash.command === "id") {
      return { type: "id" };
    }
    if (slash.command === "status") {
      const jobId = firstWord(slash.args);
      return jobId ? { type: "status", jobId } : { type: "status" };
    }
    if (slash.command === "approve") {
      const jobId = firstWord(slash.args);
      return jobId ? { type: "approve", jobId } : { type: "approve" };
    }
    if (slash.command === "deny" || slash.command === "reject") {
      const jobId = firstWord(slash.args);
      return jobId ? { type: "deny", jobId } : { type: "deny" };
    }
    if (slash.command === "mode") {
      const mode = firstWord(slash.args);
      return mode ? { type: "mode", mode } : { type: "mode" };
    }
    if (slash.command === "project" || slash.command === "projects") {
      const projectName = firstWord(slash.args);
      return projectName ? { type: "project", projectName } : { type: "project" };
    }
    if (slash.command === "do") {
      return { type: "do", task: slash.args };
    }
  }

  const lower = message.toLowerCase();
  if (lower === "help" || lower === "menu") {
    return { type: "help" };
  }
  if (lower === "id") {
    return { type: "id" };
  }
  if (lower === "status") {
    return { type: "status" };
  }
  if (lower === "approve") {
    return { type: "approve" };
  }
  if (lower === "deny" || lower === "reject") {
    return { type: "deny" };
  }
  if (lower === "mode") {
    return { type: "mode" };
  }
  if (lower === "project" || lower === "projects") {
    return { type: "project" };
  }

  const statusMatch = /^status\s+([a-z0-9-]+)$/i.exec(message);
  if (statusMatch) {
    return { type: "status", jobId: statusMatch[1] };
  }

  const approveMatch = /^approve\s+([a-z0-9-]+)$/i.exec(message);
  if (approveMatch) {
    return { type: "approve", jobId: approveMatch[1] };
  }

  const denyMatch = /^(?:deny|reject)\s+([a-z0-9-]+)$/i.exec(message);
  if (denyMatch) {
    return { type: "deny", jobId: denyMatch[1] };
  }

  const modeMatch = /^mode\s+([a-z_-]+)$/i.exec(message);
  if (modeMatch) {
    return { type: "mode", mode: modeMatch[1] };
  }

  const projectMatch = /^projects?\s+([a-z0-9_.-]+)$/i.exec(message);
  if (projectMatch) {
    return { type: "project", projectName: projectMatch[1] };
  }

  if (lower.startsWith("do ")) {
    return { type: "do", task: message.slice(3).trim() };
  }

  return { type: "do", task: message };
}
