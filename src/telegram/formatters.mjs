import { sendTelegramMessage } from "../telegram.mjs";

export function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function truncateText(input, max) {
  const value = String(input ?? "").trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function elapsedMsFromIso(isoTime) {
  const timestamp = Date.parse(String(isoTime || ""));
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  return Math.max(0, Date.now() - timestamp);
}

export function safeList(items) {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.join(", ");
}

function chunkMessage(text, maxLength = 3500) {
  const raw = String(text || "");
  if (raw.length <= maxLength) {
    return [raw];
  }

  const chunks = [];
  let remaining = raw;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength * 0.5) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

export function createTelegramMessenger(config) {
  return async function sendChatText({ chatId, text, replyToMessageId }) {
    const parts = chunkMessage(text);
    for (let index = 0; index < parts.length; index += 1) {
      await sendTelegramMessage({
        token: config.telegram.botToken,
        chatId,
        text: parts[index],
        replyToMessageId: index === 0 ? replyToMessageId : undefined,
      });
    }
  };
}

export function formatProjectSelection(state, chatId) {
  const active = state.getProjectForChat(chatId);
  return [
    `Current project: ${active.name}`,
    `Path: ${active.workdir}`,
    "",
    "Available projects:",
    ...state.availableProjectNames().map((name) => {
      const marker = name === active.name ? " (active)" : "";
      const path = state.config.codex.projects.get(name);
      return `- ${name}${marker}: ${path}`;
    }),
    "",
    "Use `project <name>` or `/project <name>` to switch.",
  ].join("\n");
}

export function formatModeSelection(state, chatId) {
  const mode = state.getExecutionModeForChat(chatId);
  return [
    `Current mode: ${mode}`,
    "",
    "Modes:",
    "- auto: run jobs immediately.",
    "- interactive: require `approve <job_id>` before run.",
    "",
    "Use `mode auto` or `mode interactive`.",
  ].join("\n");
}

export function formatHelp(config) {
  const pinHint = config.telegram.commandPin ? "<PIN> " : "";
  return [
    "Commands:",
    `${pinHint}do <task>`,
    `${pinHint}mode`,
    `${pinHint}mode <auto|interactive>`,
    `${pinHint}approve (show approval details)`,
    `${pinHint}approve <job_id>`,
    `${pinHint}deny (show denial details)`,
    `${pinHint}deny <job_id>`,
    `${pinHint}status`,
    `${pinHint}status <job_id>`,
    `${pinHint}project`,
    `${pinHint}project <name>`,
    `${pinHint}id`,
    `${pinHint}help`,
    "",
    "Telegram slash commands also work: /do, /mode, /approve, /deny, /status, /project, /id, /help",
    "Tip: plain text is treated as a coding task.",
  ].join("\n");
}

export function formatStatus(state, job, chatId) {
  if (!job) {
    const active = state.getProjectForChat(chatId);
    const mode = state.getExecutionModeForChat(chatId);
    return [
      "No jobs found for this chat yet. Send `do <task>` to start.",
      `Mode: ${mode}`,
      `Active project: ${active.name}`,
      `Path: ${active.workdir}`,
    ].join("\n");
  }

  const lines = [
    `Job ${job.id}`,
    `Status: ${job.status}`,
    `Project: ${job.projectName || state.config.codex.defaultProjectName}`,
    `Path: ${job.workdir || state.config.codex.workdir}`,
    `Request: ${truncateText(job.request, 160)}`,
  ];

  if (job.status === "queued" && job.queuedAt) {
    lines.push(`Queued for: ${formatDuration(elapsedMsFromIso(job.queuedAt))}`);
  }
  if (job.status === "pending_approval" && job.pendingApprovalAt) {
    lines.push(`Awaiting approval for: ${formatDuration(elapsedMsFromIso(job.pendingApprovalAt))}`);
    lines.push(`Approve with: approve ${job.id}`);
    lines.push(`Deny with: deny ${job.id}`);
  }
  if (job.status === "running" && job.startedAt) {
    lines.push(`Running for: ${formatDuration(elapsedMsFromIso(job.startedAt))}`);
  }
  if (job.status === "denied" && job.deniedAt) {
    lines.push(`Denied ${formatDuration(elapsedMsFromIso(job.deniedAt))} ago.`);
  }
  if (job.status === "completed" && job.summary) {
    lines.push("", truncateText(job.summary, 1200));
  }
  if (job.status === "failed" && job.error) {
    lines.push("", truncateText(job.error, 1200));
  }

  return lines.join("\n");
}

export function formatPendingChoices(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return "(none)";
  }

  return jobs.map((job) => (
    `- ${job.id} (${job.projectName}): ${truncateText(job.request, 100)}`
  )).join("\n");
}

export function formatApprovalRequest(job) {
  if (!job) {
    return "No pending approval job was found.";
  }

  return [
    "Approval Request",
    "Action: Run Codex task on your home machine",
    `Job: ${job.id}`,
    `Project: ${job.projectName}`,
    `Path: ${job.workdir}`,
    `Request: ${truncateText(job.request, 260)}`,
    "",
    "Reply with:",
    `approve ${job.id} to allow`,
    `deny ${job.id} to reject`,
  ].join("\n");
}
