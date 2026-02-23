#!/usr/bin/env node
import { spawn } from "node:child_process";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function spawnNpm(args, label) {
  const child = spawn(npmCommand(), args, {
    stdio: "inherit",
    env: process.env,
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
