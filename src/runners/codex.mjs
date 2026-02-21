import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");

function buildPrompt(transcript) {
  return [
    "You are Codex running from a mobile phone bridge.",
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
function runCodexSpawn({ binary, args, workdir, timeoutMs, outputPath, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
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
          if (line.trim()) onLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim()) onLine(`[stderr] ${line}`);
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
    // Try resuming specific session
    if (config.sessionId) {
      try {
        const args = buildResumeArgs({ config, outputPath, sessionId: config.sessionId, prompt });
        return await runCodexSpawn({
          binary: config.binary, args, workdir: config.workdir,
          timeoutMs: config.timeoutMs, outputPath, onLine,
        });
      } catch {
        await fs.rm(outputPath, { force: true });
      }
    }

    // Try resuming last session
    try {
      const args = buildResumeArgs({ config, outputPath, sessionId: null, prompt });
      return await runCodexSpawn({
        binary: config.binary, args, workdir: config.workdir,
        timeoutMs: config.timeoutMs, outputPath, onLine,
      });
    } catch {
      await fs.rm(outputPath, { force: true });
    }

    // Fresh session
    const args = buildFreshArgs({ config, outputPath, prompt });
    const result = await runCodexSpawn({
      binary: config.binary, args, workdir: config.workdir,
      timeoutMs: config.timeoutMs, outputPath, onLine,
    });

    const newSessionId = await findNewestSessionId(startTime);
    if (newSessionId) {
      result.newSessionId = newSessionId;
    }

    return result;
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    const stdout = String(error.stdout || "").trim();
    const summary = stderr || stdout || error.message || "Codex execution failed with no details.";
    throw new Error(summary);
  } finally {
    await fs.rm(outputPath, { force: true });
  }
}
