import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCodexWithRuntimeApprovals } from "../codex-app-server.mjs";
import { spawnCompat } from "../lib/spawn-compat.mjs";
import {
  extractCodexSessionIdFromText,
  findNewTalkebySession,
} from "../services/codex-sessions.mjs";
import {
  extractCodexTotalUsageFromEvent,
  extractCodexUsageFromEvent,
} from "../services/usage-parser.mjs";

let spawnCompatImpl = spawnCompat;

export function setCodexSpawnCompatForTests(spawnFn) {
  spawnCompatImpl = typeof spawnFn === "function" ? spawnFn : spawnCompat;
}
const NOISE_PATTERNS = [
  /^OpenAI Codex v/,
  /^workdir:/,
  /^model:/,
  /^provider:/,
  /^approval:/,
  /^sandbox:/,
  /^reasoning/,
  /^session id:/,
  /^mcp:/,
  /^mcp startup:/,
  /^user /,
  /^Warning: no last agent message/,
  /^At the end, return/,
  /^Keep the full response/,
  /^RESULT:/,
  /^FILES:/,
  /^NEXT:/,
  /^You are (Codex|Claude|Gemini)/,
  /^$/,
];

function isNoiseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Extract the meaningful error from Codex's noisy stderr output.
 * Strips startup info, MCP logs, prompt echo, etc.
 */
function extractMeaningfulError(rawOutput) {
  const lines = rawOutput.split("\n");
  const meaningful = lines.filter((line) => !isNoiseLine(line));

  if (meaningful.length > 0) {
    return meaningful.join("\n").trim();
  }

  const errorLine = lines.find((line) => line.trim().startsWith("ERROR:"));
  if (errorLine) return errorLine.trim();

  return rawOutput.trim().slice(0, 300);
}

function buildPrompt(transcript) {
  return String(transcript || "").trim();
}

function subtractUsageTotals(current, baseline) {
  if (!current || !baseline) {
    return null;
  }
  const inputTokens = Math.max(0, Number(current.inputTokens || 0) - Number(baseline.inputTokens || 0));
  const outputTokens = Math.max(0, Number(current.outputTokens || 0) - Number(baseline.outputTokens || 0));
  const totalTokens = Math.max(0, Number(current.totalTokens || 0) - Number(baseline.totalTokens || 0));
  const cachedInputTokens = Math.max(
    0,
    Number(current.cachedInputTokens || 0) - Number(baseline.cachedInputTokens || 0),
  );
  const reasoningOutputTokens = Math.max(
    0,
    Number(current.reasoningOutputTokens || 0) - Number(baseline.reasoningOutputTokens || 0),
  );
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) {
    return null;
  }
  return {
    source: "exact",
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
    cachedInputTokens,
    reasoningOutputTokens,
    costUsd: null,
    raw: {
      derivedFrom: "codex_total_delta",
      baseline: baseline.raw || null,
      current: current.raw || null,
    },
  };
}

function emitRuntimeEventLines(event, onLine) {
  if (!onLine || !event || !event.type) {
    return;
  }

  if (event.type === "agent_message") {
    onLine(`[agent] ${String(event.text || "").trim()}`);
    return;
  }
  if (event.type === "agent_message_delta") {
    const delta = String(event.delta || "").trim();
    if (delta) {
      onLine(`[agent] ${delta}`);
    }
    return;
  }
  if (event.type === "runtime_approval_requested") {
    const request = event.request || {};
    const kind = String(request.kind || "unknown");
    const command = String(request.command || "").trim();
    onLine(`[approval] requested (${kind})${command ? `: ${command}` : ""}`);
    return;
  }
  if (event.type === "runtime_approval_decided") {
    onLine(`[approval] ${String(event.decision || "").toLowerCase() === "approve" ? "approved" : "denied"}`);
    return;
  }
  if (event.type === "fatal_error" || event.type === "turn_failed") {
    onLine(`[error] ${String(event.message || "").trim()}`);
  }
}

function createOutputFilePath() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return path.join(os.tmpdir(), `codex-last-message-${stamp}.txt`);
}

async function readLastMessageOrFallback({ outputPath, stdout }) {
  let lastMessage = "";
  try {
    lastMessage = (await fs.readFile(outputPath, "utf8")).trim();
  } catch {
    // If codex did not emit output file, fall back to stdout.
  }
  return lastMessage || stdout.trim() || "Codex completed but returned no summary.";
}

/**
 * Run a codex command using spawn (streaming output).
 * @param {object} opts
 * @param {string[]} opts.args
 * @param {string} opts.binary
 * @param {string} opts.workdir
 * @param {number} opts.timeoutMs
 * @param {string} opts.outputPath
 * @param {function} [opts.onLine] - called with each stdout/stderr line
 * @returns {Promise<{message: string, stderr: string, nativeSessionId: string}>}
 */
function runCodexSpawn({ binary, args, workdir, timeoutMs, outputPath, onLine, signal, stdinText = "" }) {
  return new Promise((resolve, reject) => {
    const child = spawnCompatImpl(binary, args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let detectedSessionId = "";
    const stdinPayload = (() => {
      const value = String(stdinText || "");
      if (!value) {
        return "";
      }
      return value.endsWith("\n") ? value : `${value}\n`;
    })();

    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const textChunk = chunk.toString();
      stdout += textChunk;
      detectedSessionId = detectedSessionId
        || extractCodexSessionIdFromText(textChunk)
        || extractCodexSessionIdFromText(stdout)
        || extractCodexSessionIdFromText(stderr);
      if (onLine) {
        const lines = textChunk.split("\n");
        for (const line of lines) {
          if (line.trim() && !isNoiseLine(line)) onLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const textChunk = chunk.toString();
      stderr += textChunk;
      detectedSessionId = detectedSessionId
        || extractCodexSessionIdFromText(textChunk)
        || extractCodexSessionIdFromText(stderr)
        || extractCodexSessionIdFromText(stdout);
      if (onLine) {
        const lines = textChunk.split("\n");
        for (const line of lines) {
          if (line.trim() && !isNoiseLine(line)) onLine(`[stderr] ${line}`);
        }
      }
    });

    child.on("close", async (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error("Codex execution timed out."));
        return;
      }
      if (code !== 0 && code !== null) {
        const error = new Error(stderr.trim() || `Codex exited with code ${code}`);
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
        return;
      }
      try {
        const message = await readLastMessageOrFallback({ outputPath, stdout });
        resolve({
          message,
          stderr: stderr.trim(),
          nativeSessionId: detectedSessionId,
        });
      } catch (error) {
        reject(error);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    if (signal) {
      if (signal.aborted) {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1200);
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
        return;
      }
      signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1200);
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
      }, { once: true });
    }

    if (stdinPayload && child.stdin?.write) {
      child.stdin.write(stdinPayload);
    }
    child.stdin?.end();
  });
}

function buildResumeArgs({ config, outputPath, sessionId }) {
  const args = ["exec", "--output-last-message", outputPath, "resume"];

  if (sessionId) {
    args.push(sessionId);
  } else {
    args.push("--last");
  }

  if (config.model) args.push("--model", config.model);
  if (config.reasoningEffort) args.push("--reasoning-effort", config.reasoningEffort);
  if (config.planMode) args.push("--plan");
  args.push("--full-auto", "--skip-git-repo-check", "-");
  return args;
}

function buildFreshArgs({ config, outputPath }) {
  const args = [
    "exec",
    "--full-auto",
    "--skip-git-repo-check",
    "--cd",
    config.workdir,
    "--output-last-message",
    outputPath,
  ];

  if (config.model) args.push("--model", config.model);
  if (config.reasoningEffort) args.push("--reasoning-effort", config.reasoningEffort);
  if (config.planMode) args.push("--plan");
  args.push("-");
  return args;
}

async function runWithRuntimeApprovals(config) {
  const onLine = config.onLine || null;
  const onRuntimeEvent = config.onRuntimeEvent || null;
  let latestUsageAny = null;
  const usageByTurn = new Map();
  const totalsByTurn = new Map();
  let totalBaseline = null;
  let totalLatest = null;

  const result = await runCodexWithRuntimeApprovals({
    transcript: config.task,
    codexConfig: {
      binary: config.binary,
      workdir: config.workdir,
      model: config.model,
      timeoutMs: config.timeoutMs,
      interactiveApprovalPolicy: "untrusted",
      sessionId: config.sessionId || "",
      persistExtendedHistory: Boolean(config.persistExtendedHistory),
    },
    signal: config.signal,
    onApprovalRequest: config.onRuntimeApproval,
    onEvent: (event) => {
      emitRuntimeEventLines(event, onLine);
      if (event?.type === "thread_token_usage_updated") {
        const turnId = String(event.turnId || "").trim();
        const parsed = extractCodexUsageFromEvent(event);
        if (parsed && parsed.totalTokens > 0) {
          latestUsageAny = parsed;
          if (turnId) {
            usageByTurn.set(turnId, parsed);
          }
        }
        const total = extractCodexTotalUsageFromEvent(event);
        if (total && total.totalTokens > 0) {
          if (!totalBaseline) {
            totalBaseline = total;
          }
          totalLatest = total;
          if (turnId) {
            const tracked = totalsByTurn.get(turnId);
            if (tracked) {
              tracked.last = total;
            } else {
              totalsByTurn.set(turnId, { first: total, last: total });
            }
          }
        }
      }
      if (typeof onRuntimeEvent === "function") {
        onRuntimeEvent(event);
      }
    },
  });

  const activeTurnId = String(result.turnId || "").trim();
  let usage = null;
  if (activeTurnId) {
    usage = usageByTurn.get(activeTurnId) || null;
    if (!usage) {
      const turnTotals = totalsByTurn.get(activeTurnId);
      if (turnTotals) {
        usage = subtractUsageTotals(turnTotals.last, turnTotals.first);
      }
    }
    if (!usage && usageByTurn.size === 0) {
      usage = latestUsageAny;
    }
  } else {
    usage = latestUsageAny;
  }

  if ((!usage || usage.totalTokens <= 0) && totalBaseline && totalLatest) {
    const derived = subtractUsageTotals(totalLatest, totalBaseline);
    if (derived && derived.totalTokens > 0) {
      usage = derived;
    }
  }

  return {
    message: result.message,
    stderr: result.stderr || "",
    appServerThreadId: result.threadId || "",
    usage,
  };
}

/**
 * Run a task using the OpenAI Codex CLI with streaming output.
 * @param {object} config
 * @param {string} config.task
 * @param {string} config.workdir
 * @param {string} config.model
 * @param {number} config.timeoutMs
 * @param {string} config.binary
 * @param {string} [config.sessionId] - CLI session ID to resume
 * @param {function} [config.onLine] - called with each output line
 * @returns {Promise<{ message: string, newSessionId?: string }>}
 */
export async function run(config) {
  const outputPath = createOutputFilePath();
  const startTime = Date.now();
  const prompt = buildPrompt(config.task);
  const onLine = config.onLine || null;

  try {
    if (config.nativeCodexThreadMode && typeof config.onRuntimeApproval === "function") {
      throw new Error(
        "Native Codex thread continuity cannot run through Talkeby runtime approval interception. Disable RUNTIME_POLICY_ENABLED to preserve Codex thread memory.",
      );
    }

    if (typeof config.onRuntimeApproval === "function") {
      return await runWithRuntimeApprovals(config);
    }

    if (config.sessionId) {
      const args = buildResumeArgs({ config, outputPath, sessionId: config.sessionId });
      const result = await runCodexSpawn({
        binary: config.binary,
        args,
        workdir: config.workdir,
        timeoutMs: config.timeoutMs,
        outputPath,
        onLine,
        signal: config.signal,
        stdinText: prompt,
      });
      if (!result.nativeSessionId) {
        result.newSessionId = String(config.sessionId || "").trim();
      }
      return result;
    }

    const args = buildFreshArgs({ config, outputPath });
    const result = await runCodexSpawn({
      binary: config.binary,
      args,
      workdir: config.workdir,
      timeoutMs: config.timeoutMs,
      outputPath,
      onLine,
      signal: config.signal,
      stdinText: prompt,
    });

    const newSessionId = result.nativeSessionId || (await findNewTalkebySession({
      afterMs: startTime,
      workdir: config.workdir,
    }))?.sessionId || "";
    if (newSessionId) {
      result.newSessionId = newSessionId;
    }

    return result;
  } catch (error) {
    const rawStderr = String(error.stderr || "").trim();
    const rawStdout = String(error.stdout || "").trim();
    const raw = rawStderr || rawStdout || error.message || "";
    const summary = extractMeaningfulError(raw) || "Codex execution failed with no details.";
    throw new Error(summary);
  } finally {
    await fs.rm(outputPath, { force: true });
  }
}

