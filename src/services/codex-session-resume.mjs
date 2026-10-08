import { promises as fs } from "node:fs";

function hasActiveWriterConflict(error) {
  const detail = String(error?.stderr || error?.message || "");
  return /thread-store conflict: thread [\w-]+ already has an active writer/i.test(detail)
    || /thread\/resume failed: thread [\w-]+ already has an active writer/i.test(detail);
}

export async function resumeCodexSession({ config, outputPath, buildArgs, execute }) {
  try {
    const result = await execute(buildArgs("resume"));
    result.newSessionId = result.nativeSessionId || config.sessionId;
    return result;
  } catch (error) {
    // Persistence rejects the second writer before a turn starts, so this task is safe to retry.
    if (!hasActiveWriterConflict(error) || config.signal?.aborted) {
      throw error;
    }
  }

  config.onLine?.("Codex session is open in another client; continuing from a fork of its saved history.");
  await fs.rm(outputPath, { force: true });
  const result = await execute(buildArgs("fork"));
  if (!result.nativeSessionId || result.nativeSessionId === config.sessionId) {
    throw new Error("Codex fork did not return a new session id. Update the Codex CLI before retrying.");
  }
  result.newSessionId = result.nativeSessionId;
  return result;
}
