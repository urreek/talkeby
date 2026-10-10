import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveSpawnCompat } from "../../src/lib/spawn-compat.mjs";

export function findBinary(command, cwd = process.cwd()) {
  if (path.isAbsolute(command) || /[/\\]/.test(command)) {
    const candidate = path.resolve(cwd, command);
    if (process.platform === "win32" && !path.extname(candidate)) {
      const shim = [".exe", ".cmd", ".bat"].map((extension) => `${candidate}${extension}`).find((file) => fs.existsSync(file));
      if (shim) return shim;
    }
    return fs.existsSync(candidate) ? candidate : "";
  }
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    cwd, encoding: "utf8", windowsHide: true,
  });
  const candidates = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0) return "";
  return process.platform === "win32"
    ? candidates.find((candidate) => /\.(exe|cmd|bat)$/i.test(candidate)) || ""
    : candidates[0] || "";
}

export function commandSpec(command, args, options = {}) {
  if (command === "npm" && process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args], options };
  }
  return resolveSpawnCompat(findBinary(command, options.cwd) || command, args, options);
}

export function runCommand(command, args, options = {}) {
  const spec = commandSpec(command, args, { stdio: "inherit", windowsHide: true, ...options });
  const result = spawnSync(spec.command, spec.args, spec.options);
  if (result.error) throw new Error(`Could not launch ${path.basename(command)} (${result.error.code}). Check that it is installed and on PATH.`);
  return result;
}

export function requireCommand(command, args, options) {
  const result = runCommand(command, args, options);
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.signal || `exit ${result.status}`}). See the command output above.`);
}
