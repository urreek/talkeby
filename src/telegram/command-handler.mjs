import {
  parseCommand,
  resolveExecutionMode,
} from "../services/command-parser.mjs";
import {
  approveJob,
  createJobFromTask,
  denyJob,
  resolveStatusJobForChat,
} from "../services/job-lifecycle.mjs";
import {
  formatApprovalRequest,
  formatHelp,
  formatModeSelection,
  formatPendingChoices,
  formatProjectSelection,
  formatStatus,
  safeList,
  textValue,
  truncateText,
} from "./formatters.mjs";

function isAuthorizedChat(config, chatId) {
  if (config.telegram.allowUnverifiedChats) {
    return true;
  }
  if (config.telegram.allowedChatIds.size === 0) {
    return false;
  }
  return config.telegram.allowedChatIds.has(String(chatId));
}

export async function handleTextMessage({
  config,
  state,
  eventBus,
  jobRunner,
  sendChatText,
  message,
}) {
  const chatId = String(message.chat?.id ?? "");
  const text = textValue(message.text);
  if (!chatId) {
    return;
  }

  if (!isAuthorizedChat(config, chatId)) {
    const warning = config.telegram.allowedChatIds.size
      ? `Unauthorized chat: ${chatId}.`
      : `No TELEGRAM_ALLOWED_CHAT_IDS configured. This chat id is ${chatId}.`;
    await sendChatText({
      chatId,
      text: warning,
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (!text) {
    await sendChatText({
      chatId,
      text: "Text messages only for now. Use `do <task>`.",
      replyToMessageId: message.message_id,
    });
    return;
  }

  const command = parseCommand(text, config.telegram.commandPin);
  if (command.type === "pin_error") {
    const pinHelp = config.telegram.commandPin
      ? "Invalid PIN prefix. Use `<PIN> do <task>`."
      : "Invalid command.";
    await sendChatText({
      chatId,
      text: pinHelp,
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "help") {
    await sendChatText({
      chatId,
      text: formatHelp(config),
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "id") {
    await sendChatText({
      chatId,
      text: `Chat ID: ${chatId}`,
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "mode") {
    if (!command.mode) {
      await sendChatText({
        chatId,
        text: formatModeSelection(state, chatId),
        replyToMessageId: message.message_id,
      });
      return;
    }

    const selectedMode = resolveExecutionMode(command.mode);
    if (!selectedMode) {
      await sendChatText({
        chatId,
        text: [
          `Unknown mode: ${command.mode}`,
          "Allowed modes: auto, interactive",
          "",
          formatModeSelection(state, chatId),
        ].join("\n"),
        replyToMessageId: message.message_id,
      });
      return;
    }

    state.setExecutionModeForChat(chatId, selectedMode);
    await sendChatText({
      chatId,
      text: `Execution mode set to ${selectedMode}.`,
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "project") {
    if (!command.projectName) {
      await sendChatText({
        chatId,
        text: formatProjectSelection(state, chatId),
        replyToMessageId: message.message_id,
      });
      return;
    }

    const selectedName = state.resolveProjectName(command.projectName);
    if (!selectedName) {
      await sendChatText({
        chatId,
        text: [
          `Unknown project: ${command.projectName}`,
          `Available: ${safeList(state.availableProjectNames())}`,
        ].join("\n"),
        replyToMessageId: message.message_id,
      });
      return;
    }

    state.setProjectForChat(chatId, selectedName);
    await sendChatText({
      chatId,
      text: [
        `Active project set to ${selectedName}.`,
        `Path: ${config.codex.projects.get(selectedName)}`,
      ].join("\n"),
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "status") {
    const job = resolveStatusJobForChat(state, chatId, command.jobId);
    await sendChatText({
      chatId,
      text: formatStatus(state, job, chatId),
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "approve") {
    const target = resolvePendingActionTarget({
      state,
      chatId,
      explicitJobId: command.jobId,
      action: "approve",
    });
    if (target.error) {
      await sendChatText({
        chatId,
        text: target.error,
        replyToMessageId: message.message_id,
      });
      return;
    }

    const approved = approveJob({
      state,
      eventBus,
      jobRunner,
      chatId,
      jobId: target.jobId,
    });
    if (approved.error) {
      await sendChatText({
        chatId,
        text: approved.error,
        replyToMessageId: message.message_id,
      });
      return;
    }

    await sendChatText({
      chatId,
      text: [
        `Approved ${approved.job.id}.`,
        `Project: ${approved.job.projectName}`,
        `Request: ${truncateText(approved.job.request, 180)}`,
        `Queue position: ${approved.queuePosition}`,
      ].join("\n"),
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (command.type === "deny") {
    const target = resolvePendingActionTarget({
      state,
      chatId,
      explicitJobId: command.jobId,
      action: "deny",
    });
    if (target.error) {
      await sendChatText({
        chatId,
        text: target.error,
        replyToMessageId: message.message_id,
      });
      return;
    }

    const denied = denyJob({
      state,
      eventBus,
      chatId,
      jobId: target.jobId,
    });
    if (denied.error) {
      await sendChatText({
        chatId,
        text: denied.error,
        replyToMessageId: message.message_id,
      });
      return;
    }

    await sendChatText({
      chatId,
      text: [
        `Denied ${denied.job.id}.`,
        `Project: ${denied.job.projectName}`,
        `Request: ${truncateText(denied.job.request, 180)}`,
        "It will not run.",
      ].join("\n"),
      replyToMessageId: message.message_id,
    });
    return;
  }

  const created = createJobFromTask({
    state,
    eventBus,
    jobRunner,
    config,
    chatId,
    task: command.task,
  });
  if (created.error) {
    await sendChatText({
      chatId,
      text: created.error,
      replyToMessageId: message.message_id,
    });
    return;
  }

  if (!created.queued) {
    await sendChatText({
      chatId,
      text: formatApprovalRequest(created.job),
      replyToMessageId: message.message_id,
    });
    return;
  }

  await sendChatText({
    chatId,
    text: [
      `Queued as ${created.job.id}.`,
      `Project: ${created.job.projectName}`,
      `Queue position: ${created.queuePosition}`,
      "I started coding on your home machine and will post results here.",
    ].join("\n"),
    replyToMessageId: message.message_id,
  });
}

function resolvePendingActionTarget({
  state,
  chatId,
  explicitJobId,
  action,
}) {
  if (explicitJobId) {
    return { jobId: explicitJobId };
  }

  const pending = state.listPendingJobsForChat(chatId, 5);
  if (pending.length === 0) {
    return {
      error: "No pending approval jobs found. Send `do <task>` first.",
    };
  }
  if (pending.length === 1) {
    return {
      error: [
        `You are about to ${action} this job:`,
        "",
        formatApprovalRequest(pending[0]),
      ].join("\n"),
    };
  }

  return {
    error: [
      `Multiple jobs are waiting. Specify which one to ${action}.`,
      "",
      formatPendingChoices(pending),
      "",
      `Use: ${action} <job_id>`,
    ].join("\n"),
  };
}
