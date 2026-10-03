#!/usr/bin/env node
import { spawn } from "node:child_process";

function spawnNpm(args, label) {
  const isWindows = process.platform === "win32";
  // npm.cmd requires cmd.exe; only pass the fixed launcher arguments below.
  const command = isWindows ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = isWindows ? ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`] : args;
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[${label}] exited with code ${code}`);
      process.exitCode = code || 1;
    }
    if (signal) {
      // eslint-disable-next-line no-console
      console.error(`[${label}] exited with signal ${signal}`);
    }
  });

  return child;
}

const api = spawnNpm(["run", "dev"], "api");
const web = spawnNpm(["run", "web:dev", "--", "--host", "0.0.0.0"], "web");

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (api && !api.killed) {
    api.kill(signal);
  }
  if (web && !web.killed) {
    web.kill(signal);
  }
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
