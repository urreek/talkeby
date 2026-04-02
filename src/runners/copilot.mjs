import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnCompat } from "../lib/spawn-compat.mjs";

let spawnCompatImpl = spawnCompat;

export function setCopilotSpawnCompatForTests(spawnFn) {
  spawnCompatImpl = typeof spawnFn === "function" ? spawnFn : spawnCompat;
}

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeSessionId(value) {
  const normalized = textValue(value);
  if (!normalized) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._:-]{7,}$/i.test(normalized);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function splitJsonValues(text) {
  const input = String(text || "");
  const values = [];
  const length = input.length;
  let index = 0;

  while (index < length) {
    while (index < length && /\s/.test(input[index])) {
      index += 1;
    }
    if (index >= length) {
      break;
    }
    if (input[index] !== "{" && input[index] !== "[") {
      return [];
    }

    const start = index;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (; index < length; index += 1) {
      const char = input[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") {
        depth += 1;
        continue;
      }
      if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0) {
          values.push(input.slice(start, index + 1));
          index += 1;
          break;
        }
      }
    }

    if (depth !== 0 || inString) {
      return [];
    }
  }

  return values;
}

function parseJsonPayloads(text) {
  const trimmed = textValue(text);
  if (!trimmed) {
    return [];
  }

  const payload = parseJsonLine(trimmed);
  if (payload) {
    return [payload];
  }

  const segments = splitJsonValues(trimmed);
  if (segments.length === 0) {
    return [];
  }

  const payloads = [];
  for (const segment of segments) {
    const parsed = parseJsonLine(segment);
    if (!parsed) {
      return [];
    }
    payloads.push(parsed);
  }
  return payloads;
}

function collectText(value, output = []) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      output.push(text);
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, output);
    }
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  const preferredKeys = [
    "message",
    "text",
    "content",
    "response",
    "delta",
    "body",
    "value",
  ];

  for (const key of preferredKeys) {
    if (key in value) {
      collectText(value[key], output);
    }
  }

  return output;
}

function normalizeContentText(value) {
  return collectText(value, []).join("\n").trim();
}

function extractAssistantEvent(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const type = textValue(payload.type || "");
  const data = payload.data && typeof payload.data === "object" ? payload.data : null;
  if (!type || !data) {
    return null;
  }

  if (type === "assistant.message_delta") {
    const delta = typeof data.deltaContent === "string"
      ? data.deltaContent
      : (typeof data.content === "string" ? data.content : "");
    return {
      type,
      messageId: textValue(data.messageId || ""),
      text: delta,
    };
  }

  if (type === "assistant.message") {
    return {
      type,
      messageId: textValue(data.messageId || ""),
      text: normalizeContentText(data.content),
    };
  }

  return null;
}

function extractSessionId(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const directKeys = [
    "sessionId",
    "session_id",
    "conversationId",
    "conversation_id",
  ];
  for (const key of directKeys) {
    const value = textValue(payload[key]);
    if (looksLikeSessionId(value)) {
      return value;
    }
  }

  if (payload.session && typeof payload.session === "object") {
    return extractSessionId(payload.session);
  }

  if (payload.conversation && typeof payload.conversation === "object") {
    return extractSessionId(payload.conversation);
  }

  if (payload.data && typeof payload.data === "object") {
    return extractSessionId(payload.data);
  }

  return "";
}

function extractUsage(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage : null;
  if (!usage) {
    return null;
  }

  const inputTokens = Number.parseInt(String(
    usage.input_tokens
      ?? usage.inputTokens
      ?? usage.prompt_tokens
      ?? usage.promptTokens
      ?? 0,
  ), 10);
  const outputTokens = Number.parseInt(String(
    usage.output_tokens
      ?? usage.outputTokens
      ?? usage.completion_tokens
      ?? usage.completionTokens
      ?? 0,
  ), 10);
  const totalTokens = Number.parseInt(String(
    usage.total_tokens
      ?? usage.totalTokens
      ?? 0,
  ), 10);

  if (
    !Number.isFinite(inputTokens)
    && !Number.isFinite(outputTokens)
    && !Number.isFinite(totalTokens)
  ) {
    return null;
  }

  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0,
    totalTokens: Number.isFinite(totalTokens)
      ? Math.max(0, totalTokens)
      : Math.max(0, (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0)),
    costUsd: usage.cost_usd ?? usage.costUsd ?? null,
  };
}

function resolveCopilotHomeDir() {
  const configured = textValue(process.env.COPILOT_HOME || "");
  if (configured) {
    return configured;
  }
  return path.join(os.homedir(), ".copilot");
}

async function cloneCopilotConfigContents(sourceDir, targetDir) {
  let entries = [];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === "logs") {
      continue;
    }
    await fs.cp(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
      {
        recursive: true,
        force: true,
      },
    );
  }
}

async function createCopilotConfigOverride(reasoningEffort) {
  const normalizedReasoningEffort = textValue(reasoningEffort).toLowerCase();
  if (!normalizedReasoningEffort || normalizedReasoningEffort === "medium") {
    return {
      configDir: "",
      cleanup: async () => {},
    };
  }

  const sourceDir = resolveCopilotHomeDir();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-copilot-config-"));
  const configDir = path.join(tempRoot, "config");
  await fs.mkdir(configDir, { recursive: true });
  await cloneCopilotConfigContents(sourceDir, configDir);

  const configPath = path.join(configDir, "config.json");
  let currentConfig = {};
  try {
    currentConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch {
    currentConfig = {};
  }

  const nextConfig = {
    ...currentConfig,
    reasoning_effort: normalizedReasoningEffort,
  };
  await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    configDir,
    cleanup: async () => {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function buildArgs(config) {
  const args = [
    "--output-format=json",
    "--allow-all-tools",
    "--allow-all-paths",
    "--no-ask-user",
  ];

  if (config.configDir) {
    args.push("--config-dir", config.configDir);
  }

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.sessionId) {
    args.push(`--resume=${config.sessionId}`);
  }

  args.push("-p", config.task);

  return args;
}

export async function run(config) {
  const binary = config.binary || "copilot";
  const override = await createCopilotConfigOverride(config.reasoningEffort);
  const args = buildArgs({
    ...config,
    configDir: override.configDir,
  });

  return new Promise((resolve, reject) => {
    const child = spawnCompatImpl(binary, args, {
      cwd: config.workdir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdoutLines = [];
    const stderrLines = [];
    const streamedText = [];
    const assistantDeltaBuffers = new Map();
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let newSessionId = "";
    let usage = null;
    let killed = false;

    const emitAssistantMessage = (message) => {
      const normalized = textValue(message);
      if (!normalized) {
        return;
      }
      streamedText.push(normalized);
      config.onLine?.(normalized);
    };

    const emitStdoutPayload = (payload) => {
      const extractedSessionId = extractSessionId(payload);
      if (extractedSessionId) {
        newSessionId = extractedSessionId;
      }

      const extractedUsage = extractUsage(payload);
      if (extractedUsage) {
        usage = extractedUsage;
      }

      const assistantEvent = extractAssistantEvent(payload);
      if (assistantEvent?.type === "assistant.message_delta") {
        const bufferKey = assistantEvent.messageId || "__default__";
        assistantDeltaBuffers.set(
          bufferKey,
          `${assistantDeltaBuffers.get(bufferKey) || ""}${assistantEvent.text || ""}`,
        );
        return;
      }

      if (assistantEvent?.type === "assistant.message") {
        const bufferKey = assistantEvent.messageId || "__default__";
        assistantDeltaBuffers.delete(bufferKey);
        emitAssistantMessage(assistantEvent.text);
        return;
      }

      const textParts = collectText(payload, []);
      if (textParts.length === 0) {
        return;
      }
      emitAssistantMessage(textParts.join("\n"));
    };

    const emitStdoutLine = (line) => {
      const trimmed = textValue(line);
      if (!trimmed) {
        return;
      }
      stdoutLines.push(trimmed);

      const payloads = parseJsonPayloads(trimmed);
      if (payloads.length === 0) {
        streamedText.push(trimmed);
        config.onLine?.(trimmed);
        return;
      }
      for (const payload of payloads) {
        emitStdoutPayload(payload);
      }
    };

    const emitStderrLine = (line) => {
      const trimmed = textValue(line);
      if (!trimmed) {
        return;
      }
      stderrLines.push(trimmed);
      config.onLine?.(`[stderr] ${trimmed}`);
    };

    const drainBuffer = (buffer, emitLine) => {
      let remaining = buffer;
      let newlineIndex = remaining.indexOf("\n");
      while (newlineIndex >= 0) {
        emitLine(remaining.slice(0, newlineIndex));
        remaining = remaining.slice(newlineIndex + 1);
        newlineIndex = remaining.indexOf("\n");
      }
      return remaining;
    };

    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, config.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      stdoutBuffer = drainBuffer(stdoutBuffer, emitStdoutLine);
    });

    child.stderr?.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      stderrBuffer = drainBuffer(stderrBuffer, emitStderrLine);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (error && error.code === "ENOENT") {
        reject(new Error(
          `GitHub Copilot CLI binary "${binary}" was not found. Install Copilot CLI or set COPILOT_BINARY to the correct executable path.`,
        ));
        return;
      }
      reject(error);
    });

    if (config.signal) {
      if (config.signal.aborted) {
        child.kill("SIGTERM");
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
        return;
      }
      config.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1200);
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
      }, { once: true });
    }

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (stdoutBuffer.trim()) {
        emitStdoutLine(stdoutBuffer);
      }
      if (stderrBuffer.trim()) {
        emitStderrLine(stderrBuffer);
      }

      if (killed) {
        reject(new Error("GitHub Copilot CLI execution timed out."));
        return;
      }

      if (code !== 0 && code !== null) {
        reject(new Error(stderrLines.join("\n") || `GitHub Copilot CLI exited with code ${code}`));
        return;
      }

      const reconstructedMessages = [...assistantDeltaBuffers.values()]
        .map((value) => textValue(value))
        .filter(Boolean);
      const message = streamedText.join("\n").trim()
        || reconstructedMessages.join("\n").trim()
        || stdoutLines.join("\n").trim()
        || "GitHub Copilot CLI completed but returned no summary.";
      const result = { message };
      if (usage) {
        result.usage = usage;
      }
      if (newSessionId) {
        result.newSessionId = newSessionId;
      }
      resolve(result);
    });
  }).finally(async () => {
    await override.cleanup();
  });
}
