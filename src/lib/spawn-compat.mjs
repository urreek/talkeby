import { spawn } from "node:child_process";
import path from "node:path";

function shouldUseWindowsShell(command) {
  if (process.platform !== "win32") {
    return false;
  }
  const base = path.basename(String(command || "")).toLowerCase();
  return base.endsWith(".cmd") || base.endsWith(".bat");
}

export function spawnCompat(command, args, options = {}) {
  const cmd = String(command || "").trim();
  const normalizedArgs = Array.isArray(args)
    ? args
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value))
    : [];

  const shell = options.shell ?? shouldUseWindowsShell(cmd);

  return spawn(cmd, normalizedArgs, {
    ...options,
    shell,
    windowsHide: options.windowsHide ?? true,
  });
}
