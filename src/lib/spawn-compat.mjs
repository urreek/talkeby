import { spawn } from "node:child_process";
import path from "node:path";

function isWindowsCommandScript(command) {
  if (process.platform !== "win32") {
    return false;
  }
  const base = path.basename(String(command || "")).toLowerCase();
  return base.endsWith(".cmd") || base.endsWith(".bat");
}

function normalizeArgs(args) {
  return Array.isArray(args)
    ? args
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value))
    : [];
}

export function resolveSpawnCompat(command, args = [], options = {}) {
  const cmd = String(command || "").trim();
  const normalizedArgs = normalizeArgs(args);

  if (isWindowsCommandScript(cmd)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", path.normalize(cmd), ...normalizedArgs],
      options: {
        ...options,
        shell: false,
      },
    };
  }

  return {
    command: cmd,
    args: normalizedArgs,
    options: {
      ...options,
      shell: options.shell ?? false,
    },
  };
}

export function spawnCompat(command, args, options = {}) {
  const resolved = resolveSpawnCompat(command, args, options);
  return spawn(resolved.command, resolved.args, {
    ...resolved.options,
    windowsHide: resolved.options.windowsHide ?? true,
  });
}
