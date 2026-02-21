import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function buildPrompt(task) {
  return task;
}

/**
 * Find the newest Claude session file created after `afterMs`.
 * Claude stores sessions in ~/.claude/projects/<hash>/sessions/
 */
async function findClaudeSessionId(workdir, afterMs) {
  try {
    const claudeDir = path.join(os.homedir(), ".claude", "projects");
    let dirs;
    try {
      dirs = await fs.readdir(claudeDir);
    } catch {
      return null;
    }

    let newest = null;
    let newestMtime = 0;

    for (const dir of dirs) {
      const sessionsPath = path.join(claudeDir, dir, "sessions");
      let files;
      try {
        files = await fs.readdir(sessionsPath);
      } catch {
        continue;
      }

      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const fPath = path.join(sessionsPath, f);
        try {
          const stat = await fs.stat(fPath);
          if (stat.mtimeMs > afterMs && stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newest = f.replace(/\.json$/, "");
          }
        } catch {
          continue;
        }
      }
    }

    return newest;
  } catch {
    return null;
  }
}

/**
 * Run a task using the Claude Code CLI with streaming output and session support.
 * Requires `claude` CLI installed and ANTHROPIC_API_KEY set.
 */
export async function run(config) {
  const prompt = buildPrompt(config.task);
  const binary = config.binary || "claude";
  const args = ["-p", "--dangerously-skip-permissions"];
  const onLine = config.onLine || null;
  const startTime = Date.now();

  if (config.model) args.push("--model", config.model);
  if (config.reasoningEffort) args.push("--effort", config.reasoningEffort);
  if (config.planMode) args.push("--plan");

  // Session resume support
  if (config.sessionId) {
    args.push("--resume", config.sessionId);
  }

  args.push(prompt);

  const result = await spawnClaude({ binary, args, workdir: config.workdir, timeoutMs: config.timeoutMs, onLine });

  // Capture new session ID if this was a fresh run
  if (!config.sessionId) {
    const newSessionId = await findClaudeSessionId(config.workdir, startTime);
    if (newSessionId) {
      result.newSessionId = newSessionId;
    }
  }

  return result;
}

function spawnClaude({ binary, args, workdir, timeoutMs, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
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
        reject(new Error("Claude execution timed out."));
        return;
      }
      if (code !== 0 && code !== null) {
        const err = new Error(stderr.trim() || `Claude exited with code ${code}`);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      const message = stdout.trim() || "Claude completed but returned no summary.";
      resolve({ message });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdin?.end();
  });
}
