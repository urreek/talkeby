import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { commandSpec } from "../setup/process.mjs";

export async function assertPortFree(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () => reject(new Error(`Port ${port} is occupied. Stop the existing Talkeby instance before remote start.`)));
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function waitForHttp(url, signal, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch (error) { if (signal.aborted) throw error; }
    await delay(200, undefined, { signal });
  }
  throw new Error(`Talkeby did not become ready at ${url}. Check the server output above.`);
}

export class RemoteSupervisor {
  constructor({ spawnProcess = spawn, killTree, platform = process.platform } = {}) {
    this.spawnProcess = spawnProcess;
    this.platform = platform;
    this.killTree = killTree || ((child) => {
      if (!child.pid) return;
      if (platform === "win32") {
        spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      } else {
        try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    });
    this.children = [];
    this.abort = new AbortController();
    this.stopped = false;
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  launch(label, command, args, options) {
    this.abort.signal.throwIfAborted();
    const spec = commandSpec(command, args, {
      stdio: "inherit", windowsHide: true, detached: this.platform !== "win32", ...options,
    });
    const child = this.spawnProcess(spec.command, spec.args, spec.options);
    this.children.push(child);
    child.once("error", () => this.stop(new Error(`Could not start ${label}. Check its installation and configuration.`)));
    child.once("exit", (code, signal) => {
      if (!this.stopped) this.stop(new Error(`${label} stopped (${signal || `exit ${code}`}). Remote access was stopped too.`));
    });
    return child;
  }

  stop(error) {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort(error || new Error("Remote access stopped."));
    for (const child of this.children.toReversed()) {
      try { this.killTree(child); } catch { console.error("Could not stop a child process. Stop the remaining process before restarting Talkeby."); }
    }
    this.resolveDone(error);
  }
}
