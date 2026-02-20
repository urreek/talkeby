import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function buildPrompt(task) {
  return [
    "You are Claude Code running from a mobile phone bridge.",
    "Treat the quoted text as the user's coding request and execute it in this workspace.",
    "",
    `User request: """${task}"""`,
    "",
    "At the end, return a concise summary for chat with exactly these headings:",
    "RESULT:",
    "FILES:",
    "NEXT:",
    "",
    "Keep the full response under 120 words and plain text.",
  ].join("\n");
}

/**
 * Run a task using the Claude Code CLI.
 * Requires `claude` CLI installed and ANTHROPIC_API_KEY set.
 * @param {{ task: string, workdir: string, model: string, timeoutMs: number, binary: string }} config
 * @returns {Promise<{ message: string }>}
 */
export async function run(config) {
  const prompt = buildPrompt(config.task);
  const binary = config.binary || "claude";
  const args = [
    "-p",
    "--dangerously-skip-permissions",
  ];

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.reasoningEffort) {
    args.push("--effort", config.reasoningEffort);
  }
  if (config.planMode) {
    args.push("--plan");
  }

  args.push(prompt);

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      cwd: config.workdir,
      timeout: config.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    const message = stdout.trim() || "Claude completed but returned no summary.";
    return { message };
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    const stdout = String(error.stdout || "").trim();
    const summary =
      stderr || stdout || error.message || "Claude execution failed with no details.";
    throw new Error(summary);
  }
}
