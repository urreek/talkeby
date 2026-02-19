import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function buildPrompt(transcript) {
  return [
    "You are Codex running from a Telegram phone bridge.",
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

export async function runCodex({ transcript, codexConfig }) {
  const outputPath = createOutputFilePath();
  const prompt = buildPrompt(transcript);

  const args = [
    "exec",
    "--full-auto",
    "--skip-git-repo-check",
    "--cd",
    codexConfig.workdir,
    "--output-last-message",
    outputPath,
  ];

  if (codexConfig.model) {
    args.push("--model", codexConfig.model);
  }
  args.push(prompt);

  try {
    const { stdout, stderr } = await execFileAsync(codexConfig.binary, args, {
      cwd: codexConfig.workdir,
      timeout: codexConfig.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    let lastMessage = "";
    try {
      lastMessage = (await fs.readFile(outputPath, "utf8")).trim();
    } catch {
      // If codex did not emit output file, fall back to stdout.
    }

    return {
      message: lastMessage || stdout.trim() || "Codex completed but returned no summary.",
      stderr: stderr.trim(),
    };
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
