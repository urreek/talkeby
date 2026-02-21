import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

async function runCodexCommand({ binary, args, workdir, timeoutMs, outputPath }) {
  const { stdout, stderr } = await execFileAsync(binary, args, {
    cwd: workdir,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    message: await readLastMessageOrFallback({
      outputPath,
      stdout,
    }),
    stderr: stderr.trim(),
  };
}

/**
 * Find the newest session file created after `afterMs` timestamp.
 * Returns the session UUID or null.
 */
async function findNewestSessionId(afterMs) {
  try {
    const now = new Date(afterMs);
    const yearDir = path.join(CODEX_SESSIONS_DIR, String(now.getFullYear()));
    const monthDir = path.join(yearDir, String(now.getMonth() + 1).padStart(2, "0"));

    // Scan the month directory and today's date folder
    const dayDir = path.join(monthDir, String(now.getDate()).padStart(2, "0"));
    let files = [];
    try {
      files = await fs.readdir(dayDir);
    } catch {
      // day dir might not exist yet
      return null;
    }

    // Find files created after our timestamp
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

    // Extract UUID from filename: rollout-YYYY-MM-DDTHH-MM-SS-<UUID>.jsonl
    const match = newest.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function runResumeSession({ task, config, outputPath, sessionId }) {
  const prompt = buildPrompt(task);
  const args = ["exec", "--output-last-message", outputPath, "resume"];

  if (sessionId) {
    args.push(sessionId);
  } else {
    args.push("--last");
  }

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.reasoningEffort) {
    args.push("--reasoning-effort", config.reasoningEffort);
  }
  if (config.planMode) {
    args.push("--plan");
  }
  args.push("--full-auto", "--skip-git-repo-check", prompt);

  return runCodexCommand({
    binary: config.binary,
    args,
    workdir: config.workdir,
    timeoutMs: config.timeoutMs,
    outputPath,
  });
}

async function runFreshSessionOrThrow({ task, config, outputPath }) {
  const prompt = buildPrompt(task);
  const args = [
    "exec",
    "--full-auto",
    "--skip-git-repo-check",
    "--cd",
    config.workdir,
    "--output-last-message",
    outputPath,
  ];

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.reasoningEffort) {
    args.push("--reasoning-effort", config.reasoningEffort);
  }
  if (config.planMode) {
    args.push("--plan");
  }
  args.push(prompt);

  return runCodexCommand({
    binary: config.binary,
    args,
    workdir: config.workdir,
    timeoutMs: config.timeoutMs,
    outputPath,
  });
}

/**
 * Run a task using the OpenAI Codex CLI.
 * @param {object} config
 * @param {string} config.task
 * @param {string} config.workdir
 * @param {string} config.model
 * @param {number} config.timeoutMs
 * @param {string} config.binary
 * @param {string} [config.sessionId] - CLI session ID to resume
 * @returns {Promise<{ message: string, newSessionId?: string }>}
 */
export async function run(config) {
  const outputPath = createOutputFilePath();
  const startTime = Date.now();

  try {
    // If we have a session ID, resume that specific session
    if (config.sessionId) {
      try {
        const result = await runResumeSession({
          task: config.task,
          config,
          outputPath,
          sessionId: config.sessionId,
        });
        return result;
      } catch {
        await fs.rm(outputPath, { force: true });
        // Fall through to try --last or fresh
      }
    }

    // Try resuming the last session for this working directory
    try {
      const result = await runResumeSession({
        task: config.task,
        config,
        outputPath,
        sessionId: null,
      });
      return result;
    } catch {
      await fs.rm(outputPath, { force: true });
    }

    // Fall back to a fresh session and capture the new session ID
    const result = await runFreshSessionOrThrow({
      task: config.task,
      config,
      outputPath,
    });

    // Try to find the new session ID
    const newSessionId = await findNewestSessionId(startTime);
    if (newSessionId) {
      result.newSessionId = newSessionId;
    }

    return result;
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    const stdout = String(error.stdout || "").trim();
    const summary =
      stderr || stdout || error.message || "Codex execution failed with no details.";
    throw new Error(summary);
  } finally {
    await fs.rm(outputPath, { force: true });
  }
}
