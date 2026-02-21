import { spawn } from "node:child_process";

function buildPrompt(task) {
  return task;
}

/**
 * Run a task using the Gemini CLI with streaming output.
 * Requires `gemini` CLI installed and GOOGLE_API_KEY set.
 */
export async function run(config) {
  const prompt = buildPrompt(config.task);
  const binary = config.binary || "gemini";
  const args = [];
  const onLine = config.onLine || null;

  if (config.model) args.push("--model", config.model);
  if (config.planMode) args.push("--plan");
  args.push(prompt);

  const env = { ...process.env };
  if (config.reasoningEffort) {
    env.GEMINI_THINKING_LEVEL = config.reasoningEffort;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: config.workdir,
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
