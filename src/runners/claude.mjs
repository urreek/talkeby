import { spawn } from "node:child_process";

function buildPrompt(task) {
  return task;
}

/**
 * Run a task using the Claude Code CLI with streaming output.
 * Requires `claude` CLI installed and ANTHROPIC_API_KEY set.
 */
export async function run(config) {
  const prompt = buildPrompt(config.task);
  const binary = config.binary || "claude";
  const args = ["-p", "--dangerously-skip-permissions"];
  const onLine = config.onLine || null;

  if (config.model) args.push("--model", config.model);
  if (config.reasoningEffort) args.push("--effort", config.reasoningEffort);
  if (config.planMode) args.push("--plan");
  args.push(prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: config.workdir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, config.timeoutMs);

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
