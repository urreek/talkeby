import { spawn } from "node:child_process";

function buildPrompt(transcript) {
  return [
    "You are Codex running from a Telegram phone bridge.",
    "Treat the quoted text as the user's coding request and execute it in this workspace.",
    "",
    `User request: """${transcript}"""`,
    "",
    "At the end, return a concise summary for chat with exactly these headings:",
    "RESULT:",
    "FILES:",
    "NEXT:",
    "",
    "Keep the full response under 120 words and plain text.",
  ].join("\n");
}

function toSafeString(value) {
  return typeof value === "string" ? value : "";
}

function parseLineAsJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function mapApprovalDecisionForMethod(method, decision) {
  if (method === "item/commandExecution/requestApproval") {
    return {
      decision: decision === "deny" ? "decline" : "accept",
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      decision: decision === "deny" ? "decline" : "accept",
    };
  }
  if (method === "execCommandApproval") {
    return {
      decision: decision === "deny" ? "denied" : "approved",
    };
  }
  if (method === "applyPatchApproval") {
    return {
      decision: decision === "deny" ? "denied" : "approved",
    };
  }
  return {
    decision: "decline",
  };
}

function normalizeApprovalRequest(message) {
  if (!message || !message.method || !message.params) {
    return null;
  }

  if (message.method === "item/commandExecution/requestApproval") {
    return {
      kind: "command",
      method: message.method,
      requestId: message.id,
      threadId: toSafeString(message.params.threadId),
      turnId: toSafeString(message.params.turnId),
      itemId: toSafeString(message.params.itemId),
      approvalId: toSafeString(message.params.approvalId),
      command: toSafeString(message.params.command),
      cwd: toSafeString(message.params.cwd),
      reason: toSafeString(message.params.reason),
      commandActions: Array.isArray(message.params.commandActions)
        ? message.params.commandActions
        : [],
    };
  }

  if (message.method === "item/fileChange/requestApproval") {
    return {
      kind: "file_change",
      method: message.method,
      requestId: message.id,
      threadId: toSafeString(message.params.threadId),
      turnId: toSafeString(message.params.turnId),
      itemId: toSafeString(message.params.itemId),
      reason: toSafeString(message.params.reason),
      grantRoot: toSafeString(message.params.grantRoot),
    };
  }

  if (message.method === "execCommandApproval") {
    const command = Array.isArray(message.params.command)
      ? message.params.command.join(" ")
      : "";
    return {
      kind: "command",
      method: message.method,
      requestId: message.id,
      threadId: toSafeString(message.params.conversationId),
      turnId: "",
      itemId: toSafeString(message.params.callId),
      approvalId: toSafeString(message.params.approvalId),
      command,
      cwd: toSafeString(message.params.cwd),
      reason: toSafeString(message.params.reason),
      commandActions: Array.isArray(message.params.parsedCmd)
        ? message.params.parsedCmd
        : [],
    };
  }

  if (message.method === "applyPatchApproval") {
    return {
      kind: "file_change",
      method: message.method,
      requestId: message.id,
      threadId: toSafeString(message.params.conversationId),
      turnId: "",
      itemId: toSafeString(message.params.callId),
      reason: toSafeString(message.params.reason),
      grantRoot: toSafeString(message.params.grantRoot),
    };
  }

  return null;
}

function lineReader(stream, onLine) {
  stream.setEncoding("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) {
        break;
      }
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        onLine(line);
      }
    }
  });
}

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error(`Codex app-server timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    }),
  ]);
}

export async function runCodexWithRuntimeApprovals({
  transcript,
  codexConfig,
  onApprovalRequest,
}) {
  const prompt = buildPrompt(transcript);

  const child = spawn(codexConfig.binary, ["app-server", "--listen", "stdio://"], {
    cwd: codexConfig.workdir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextRequestId = 1;
  const pendingRequests = new Map();
  let stderrBuffer = "";

  let threadId = "";
  let activeTurnId = "";
  let lastAgentMessage = "";
  let lastFatalError = "";
  let done = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  function safeComplete(fn) {
    if (done) {
      return;
    }
    done = true;
    fn();
  }

  function writeJson(message) {
    if (!child.stdin.writable) {
      return;
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function sendRequest(method, params) {
    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      pendingRequests.set(String(id), { resolve, reject });
      writeJson({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    });
  }

  async function handleServerRequest(message) {
    const request = normalizeApprovalRequest(message);
    if (!request) {
      writeJson({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Unsupported method: ${message.method}`,
        },
      });
      return;
    }

    let decision = "deny";
    try {
      decision = (await onApprovalRequest(request)) === "approve" ? "approve" : "deny";
    } catch {
      decision = "deny";
    }

    writeJson({
      jsonrpc: "2.0",
      id: message.id,
      result: mapApprovalDecisionForMethod(request.method, decision),
    });
  }

  function handleNotification(message) {
    if (message.method === "codex/event/agent_message") {
      const value = message.params?.msg?.message;
      if (typeof value === "string" && value.trim()) {
        lastAgentMessage = value.trim();
      }
      return;
    }

    if (message.method === "codex/event/agent_message_delta") {
      const delta = message.params?.msg?.delta;
      if (typeof delta === "string") {
        lastAgentMessage += delta;
      }
      return;
    }

    if (message.method === "codex/event/task_complete") {
      if (message.params?.msg?.turn_id === activeTurnId) {
        const candidate = message.params?.msg?.last_agent_message;
        if (typeof candidate === "string" && candidate.trim()) {
          lastAgentMessage = candidate.trim();
        }
      }
      return;
    }

    if (message.method === "error") {
      const fatal = message.params?.willRetry === false;
      const text = toSafeString(message.params?.error?.message);
      if (fatal && text) {
        lastFatalError = text;
      }
      return;
    }

    if (message.method === "turn/completed") {
      const turn = message.params?.turn;
      if (!turn || toSafeString(turn.id) !== activeTurnId) {
        return;
      }
      if (toSafeString(turn.status).toLowerCase() === "failed") {
        const messageText = toSafeString(turn.error?.message)
          || lastFatalError
          || "Codex turn failed with no details.";
        safeComplete(() => {
          rejectCompletion(new Error(messageText));
        });
        return;
      }

      safeComplete(() => {
        resolveCompletion({
          message: lastAgentMessage.trim() || "Codex completed but returned no summary.",
          stderr: stderrBuffer.trim(),
          threadId,
          turnId: activeTurnId,
        });
      });
    }
  }

  function handleMessage(message) {
    const isResponse = message && Object.hasOwn(message, "id")
      && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))
      && !Object.hasOwn(message, "method");
    if (isResponse) {
      const handler = pendingRequests.get(String(message.id));
      if (!handler) {
        return;
      }
      pendingRequests.delete(String(message.id));
      if (Object.hasOwn(message, "error")) {
        handler.reject(new Error(toSafeString(message.error?.message) || "Codex RPC error"));
      } else {
        handler.resolve(message.result);
      }
      return;
    }

    const isServerRequest = message && Object.hasOwn(message, "id") && Object.hasOwn(message, "method");
    if (isServerRequest) {
      void handleServerRequest(message);
      return;
    }

    if (message && Object.hasOwn(message, "method")) {
      handleNotification(message);
    }
  }

  lineReader(child.stdout, (line) => {
    const message = parseLineAsJson(line);
    if (!message) {
      return;
    }
    handleMessage(message);
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });

  child.on("error", (error) => {
    safeComplete(() => {
      rejectCompletion(error);
    });
  });

  child.on("exit", (code) => {
    if (done) {
      return;
    }
    safeComplete(() => {
      rejectCompletion(new Error(`Codex app-server exited before completion (code: ${code ?? "null"})`));
    });
  });

  try {
    await sendRequest("initialize", {
      clientInfo: {
        name: "talkeby",
        title: "Talkeby",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    const threadStart = await sendRequest("thread/start", {
      cwd: codexConfig.workdir,
      model: codexConfig.model || null,
      approvalPolicy: codexConfig.interactiveApprovalPolicy || "untrusted",
      sandbox: "workspace-write",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    });
    threadId = toSafeString(threadStart?.thread?.id);
    if (!threadId) {
      throw new Error("Codex thread/start did not return a thread id.");
    }

    const turnStart = await sendRequest("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: prompt,
          text_elements: [],
        },
      ],
      approvalPolicy: codexConfig.interactiveApprovalPolicy || "untrusted",
      model: codexConfig.model || null,
    });
    activeTurnId = toSafeString(turnStart?.turn?.id);
    if (!activeTurnId) {
      throw new Error("Codex turn/start did not return a turn id.");
    }

    return await withTimeout(completion, codexConfig.timeoutMs, () => {
      child.kill("SIGTERM");
    });
  } finally {
    for (const handler of pendingRequests.values()) {
      handler.reject(new Error("Codex app-server closed before response."));
    }
    pendingRequests.clear();
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}
