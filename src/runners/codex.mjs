import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCodexWithRuntimeApprovals } from "../codex-app-server.mjs";
import { spawnCompat } from "../lib/spawn-compat.mjs";
import {
  extractCodexTotalUsageFromEvent,
  extractCodexUsageFromEvent,
} from "../services/usage-parser.mjs";

const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");

// Lines from Codex stderr that are just startup noise, not real errors
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
  /^Treat the quoted text/,
  /^User request:/,
  /^"""/,
  /^$/,
];

function isNoiseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return NOISE_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Extract the meaningful error from Codex's noisy stderr output.
 * Strips startup info, MCP logs, prompt echo, etc.
 */
function extractMeaningfulError(rawOutput) {
  const lines = rawOutput.split("\n");
  const meaningful = lines.filter((l) => !isNoiseLine(l));

  if (meaningful.length > 0) {
    return meaningful.join("\n").trim();
  }

  // If everything was filtered, look for ERROR: lines specifically
  const errorLine = lines.find((l) => l.trim().startsWith("ERROR:"));
  if (errorLine) return errorLine.trim();

  return rawOutput.trim().slice(0, 300);
}

function buildPrompt(transcript) {
  return transcript;
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
 * @returns {Promise<{message: string, stderr: string}>}
 */
function runCodexSpawn({ binary, args, workdir, timeoutMs, outputPath, onLine, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawnCompat(binary, args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim() && !isNoiseLine(line)) onLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) {
        const lines = text.split("\n");
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
        const err = new Error(stderr.trim() || `Codex exited with code ${code}`);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      try {
        const message = await readLastMessageOrFallback({ outputPath, stdout });
        resolve({ message, stderr: stderr.trim() });
      } catch (e) {
        reject(e);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
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

    // Close stdin immediately
    child.stdin?.end();
  });
}

/**
 * Find the newest session file created after `afterMs` timestamp.
 * Returns the session UUID or null.
 */
async function findNewestSessionId(afterMs) {
  try {
    const now = new Date(afterMs);
    const dayDir = path.join(
      CODEX_SESSIONS_DIR,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    );

    let files = [];
    try {
      files = await fs.readdir(dayDir);
    } catch {
      return null;
    }

    let newest = null;
    let newestMtime = 0;
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const fPath = path.join(dayDir, f);
      const stat = await fs.stat(fPath);
      if (stat.mtimeMs > afterMs && stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs;
        newest = f;
      }
    }

    if (!newest) return null;

    const match = newest.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i,
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function buildResumeArgs({ config, outputPath, sessionId, prompt }) {
  const args = ["exec", "--output-last-message", outputPath, "resume"];

  if (sessionId) {
    args.push(sessionId);
  } else {
    args.push("--last");
  }

  if (config.model) args.push("--model", config.model);
  if (config.reasoningEffort) args.push("--reasoning-effort", config.reasoningEffort);
  if (config.planMode) args.push("--plan");
  args.push("--full-auto", "--skip-git-repo-check", prompt);
  return args;
}

function buildFreshArgs({ config, outputPath, prompt }) {
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
  args.push(prompt);
  return args;
}

async function runWithRuntimeApprovals(config) {
  const onLine = config.onLine || null;
  const onRuntimeEvent = config.onRuntimeEvent || null;
  let usage = null;
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
    },
    signal: config.signal,
    onApprovalRequest: config.onRuntimeApproval,
    onEvent: (event) => {
      emitRuntimeEventLines(event, onLine);
      if (event?.type === "thread_token_usage_updated") {
        const parsed = extractCodexUsageFromEvent(event);
        if (parsed && parsed.totalTokens > 0) {
          usage = parsed;
        }
        const total = extractCodexTotalUsageFromEvent(event);
        if (total && total.totalTokens > 0) {
          if (!totalBaseline) {
            totalBaseline = total;
          }
          totalLatest = total;
        }
      }
      if (typeof onRuntimeEvent === "function") {
        onRuntimeEvent(event);
      }
    },
  });

  if ((!usage || usage.totalTokens <= 0) && totalBaseline && totalLatest) {
    const derived = subtractUsageTotals(totalLatest, totalBaseline);
    if (derived && derived.totalTokens > 0) {
      usage = derived;
    }
  }

  return {
    message: result.message,
    stderr: result.stderr || "",
    newSessionId: result.threadId || "",
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
    if (typeof config.onRuntimeApproval === "function") {
      return await runWithRuntimeApprovals(config);
    }

    // Try resuming specific session (no automatic fallback retry)
    if (config.sessionId) {
      const args = buildResumeArgs({ config, outputPath, sessionId: config.sessionId, prompt });
        return await runCodexSpawn({
          binary: config.binary, args, workdir: config.workdir,
          timeoutMs: config.timeoutMs, outputPath, onLine, signal: config.signal,
        });
      }

    // No session ID — start fresh (don't use --last, it might grab another thread's session)
    const args = buildFreshArgs({ config, outputPath, prompt });
    const result = await runCodexSpawn({
      binary: config.binary, args, workdir: config.workdir,
      timeoutMs: config.timeoutMs, outputPath, onLine, signal: config.signal,
    });

    const newSessionId = await findNewestSessionId(startTime);
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
