import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function buildPrompt(task) {
  return task;
}

/**
 * Find the newest Gemini session created after `afterMs`.
 * Gemini stores sessions in ~/.gemini/sessions/ as JSON files.
 */
async function findGeminiSessionId(afterMs) {
  try {
    const sessionsDir = path.join(os.homedir(), ".gemini", "sessions");
    let files;
    try {
      files = await fs.readdir(sessionsDir);
    } catch {
      return null;
    }

    let newest = null;
    let newestMtime = 0;

    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const fPath = path.join(sessionsDir, f);
      try {
        const stat = await fs.stat(fPath);
        if (stat.mtimeMs > afterMs && stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          // Extract session ID from filename (UUID.json or similar)
          newest = f.replace(/\.json$/, "");
        }
      } catch {
        continue;
      }
    }

    return newest;
  } catch {
    return null;
  }
}

/**
 * Run a task using the Gemini CLI with streaming output and session support.
 * Requires `gemini` CLI installed and GOOGLE_API_KEY set.
 */
export async function run(config) {
  const prompt = buildPrompt(config.task);
  const binary = config.binary || "gemini";
  const args = [];
  const onLine = config.onLine || null;
  const startTime = Date.now();

  if (config.model) args.push("--model", config.model);
  if (config.planMode) args.push("--plan");

  // Session resume support
  if (config.sessionId) {
    args.push("--resume", config.sessionId);
  }

  args.push(prompt);

  const env = { ...process.env };
  if (config.reasoningEffort) {
    env.GEMINI_THINKING_LEVEL = config.reasoningEffort;
  }

  const result = await spawnGemini({ binary, args, workdir: config.workdir, timeoutMs: config.timeoutMs, onLine, env });

  // Capture new session ID if this was a fresh run
  if (!config.sessionId) {
    const newSessionId = await findGeminiSessionId(startTime);
    if (newSessionId) {
      result.newSessionId = newSessionId;
    }
  }

  return result;
}

function spawnGemini({ binary, args, workdir, timeoutMs, onLine, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env,
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
        for (const line of text.split("\n")) {
          if (line.trim()) onLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) {
        for (const line of text.split("\n")) {
          if (line.trim()) onLine(`[stderr] ${line}`);
        }
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error("Gemini execution timed out."));
        return;
      }
      if (code !== 0 && code !== null) {
        const err = new Error(stderr.trim() || `Gemini exited with code ${code}`);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      const message = stdout.trim() || "Gemini completed but returned no summary.";
      resolve({ message });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdin?.end();
  });
}
