import { spawnCompat } from "../lib/spawn-compat.mjs";

function createConnection(child) {
  let buffer = "";
  let nextId = 0;
  let failed = false;
  const pending = new Map();
  function fail() {
    failed = true;
    for (const handler of pending.values()) handler.reject(new Error("Codex usage connection failed."));
    pending.clear();
  }
  child.on("error", fail);
  child.on("exit", fail);
  child.stdin.on("error", fail);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 1_048_576) { fail(); child.kill(); return; }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (!message || message.method || (!Object.hasOwn(message, "result") && !Object.hasOwn(message, "error"))) continue;
      const handler = pending.get(message?.id);
      if (!handler) continue;
      pending.delete(message.id);
      if (message.error) handler.reject(new Error("Codex could not read subscription limits."));
      else handler.resolve(message.result);
    }
  });
  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function request(method, params) {
    return new Promise((resolve, reject) => {
      if (failed) { reject(new Error("Codex usage connection failed.")); return; }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      send({ id, method, ...(params ? { params } : {}) });
    });
  }
  return { request, send, fail };
}

export async function readCodexSubscription(codexConfig, { spawn = spawnCompat, timeoutMs = 8_000 } = {}) {
  const child = spawn(codexConfig.binary, ["app-server", "--listen", "stdio://"], {
    cwd: codexConfig.workdir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.resume();
  const connection = createConnection(child);
  const timer = setTimeout(() => { connection.fail(); child.kill(); }, timeoutMs);
  try {
    await connection.request("initialize", {
      clientInfo: { name: "talkeby", version: "0.1.0" },
      capabilities: {},
    });
    connection.send({ method: "initialized" });
    return await connection.request("account/rateLimits/read");
  } finally {
    clearTimeout(timer);
    connection.fail();
    child.kill();
  }
}
