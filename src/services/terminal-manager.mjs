import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";

import { spawnCompat } from "../lib/spawn-compat.mjs";

const MAX_BUFFERED_EVENTS = 1200;

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso() {
  return new Date().toISOString();
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function normalizeOutputChunk(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
  return stripAnsi(text).replace(/\r\n/g, "\n");
}

function normalizeInputLines(input) {
  return String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripTrailingDelimiters(command) {
  return String(command || "").replace(/[;\s]+$/g, "").trim().toLowerCase();
}

function isClearCommandInput(input) {
  const lines = normalizeInputLines(input);
  if (lines.length !== 1) {
    return false;
  }

  const normalized = stripTrailingDelimiters(lines[0]);
  return normalized === "clear"
    || normalized === "cls"
    || normalized === "clear-host";
}

export function resolveTerminalShell() {
  const override = textValue(process.env.TALKEBY_TERMINAL_BINARY || "");
  if (process.platform === "win32") {
    return {
      command: override || "powershell.exe",
      args: ["-NoLogo", "-NoProfile"],
    };
  }

  const command = override || textValue(process.env.SHELL || "") || "/bin/bash";
  const interactiveArgs = /(?:bash|zsh|fish|sh)$/i.test(command) ? ["-i"] : [];
  return {
    command,
    args: interactiveArgs,
  };
}

function cloneEvent(event) {
  return {
    id: event.id,
    sessionId: event.sessionId,
    eventType: event.eventType,
    stream: event.stream,
    data: event.data,
    createdAt: event.createdAt,
    exitCode: event.exitCode ?? null,
  };
}

function cloneSession(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: session.status,
    shell: session.shell,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    closedAt: session.closedAt,
    exitCode: session.exitCode,
  };
}

export class TerminalManager {
  constructor({
    defaultCwd = "",
    spawnFn = spawnCompat,
    log = null,
  } = {}) {
    this.defaultCwd = textValue(defaultCwd || "") || process.cwd();
    this.spawnFn = typeof spawnFn === "function" ? spawnFn : spawnCompat;
    this.log = log;
    this.eventEmitter = new EventEmitter();
    this.session = null;
  }

  resolveCwd(value) {
    const requested = textValue(value);
    return path.resolve(requested || this.defaultCwd || process.cwd());
  }

  getSession() {
    return cloneSession(this.session);
  }

  listEventsAfter({ afterEventId = 0, limit = 500 } = {}) {
    if (!this.session) {
      return [];
    }

    const safeAfter = Math.max(0, Number(afterEventId) || 0);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
    return this.session.events
      .filter((event) => event.id > safeAfter)
      .slice(-safeLimit)
      .map(cloneEvent);
  }

  subscribe(onEvent) {
    if (typeof onEvent !== "function") {
      return () => {};
    }

    this.eventEmitter.on("event", onEvent);
    return () => {
      this.eventEmitter.off("event", onEvent);
    };
  }

  ensureSession({ cwd = "" } = {}) {
    if (this.session?.status === "running" || this.session?.status === "closing") {
      return this.getSession();
    }
    return this.startSession({ cwd });
  }

  startSession({ cwd = "" } = {}) {
    if (this.session?.status === "running" || this.session?.status === "closing") {
      return this.getSession();
    }

    const resolvedCwd = this.resolveCwd(cwd);
    const shell = resolveTerminalShell();
    const createdAt = nowIso();
    const child = this.spawnFn(shell.command, shell.args, {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        TERM: process.env.TERM || "dumb",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const session = {
      id: crypto.randomUUID(),
      status: "running",
      shell: [shell.command, ...shell.args].join(" ").trim(),
      cwd: resolvedCwd,
      createdAt,
      updatedAt: createdAt,
      closedAt: null,
      exitCode: null,
      nextEventId: 1,
      events: [],
      child,
    };
    this.session = session;

    child.stdout?.on("data", (chunk) => {
      this.pushEvent(session.id, {
        eventType: "terminal_output",
        stream: "stdout",
        data: normalizeOutputChunk(chunk),
      });
    });

    child.stderr?.on("data", (chunk) => {
      this.pushEvent(session.id, {
        eventType: "terminal_output",
        stream: "stderr",
        data: normalizeOutputChunk(chunk),
      });
    });

    child.on("error", (error) => {
      const message = textValue(error?.message || "");
      if (message) {
        this.pushEvent(session.id, {
          eventType: "terminal_output",
          stream: "stderr",
          data: `${message}\n`,
        });
      }
    });

    child.on("close", (code) => {
      if (this.session?.id !== session.id) {
        return;
      }
      session.status = "closed";
      session.closedAt = nowIso();
      session.updatedAt = session.closedAt;
      session.exitCode = Number.isFinite(code) ? Number(code) : null;
      this.pushEvent(session.id, {
        eventType: "terminal_exit",
        stream: "system",
        data: `Terminal exited${session.exitCode === null ? "" : ` (${session.exitCode})`}.\n`,
        exitCode: session.exitCode,
      });
    });

    this.pushEvent(session.id, {
      eventType: "terminal_status",
      stream: "system",
      data: `Connected to ${shell.command} in ${resolvedCwd}\n`,
    });

    return this.getSession();
  }

  writeInput(input) {
    const session = this.session;
    if (!session || session.status !== "running") {
      throw new Error("Terminal is not running.");
    }

    const safeInput = String(input ?? "");
    if (!safeInput) {
      return this.getSession();
    }
    if (isClearCommandInput(safeInput)) {
      return this.clearSession();
    }
    if (!session.child.stdin?.writable) {
      throw new Error("Terminal stdin is not writable.");
    }

    session.child.stdin.write(safeInput);
    this.pushEvent(session.id, {
      eventType: "terminal_input",
      stream: "stdin",
      data: safeInput.replace(/\r\n/g, "\n"),
    });
    return this.getSession();
  }

  clearSession() {
    const session = this.session;
    if (!session || session.status !== "running") {
      throw new Error("Terminal is not running.");
    }

    session.events = [];
    this.pushEvent(session.id, {
      eventType: "terminal_clear",
      stream: "system",
      data: "",
    });
    return this.getSession();
  }

  closeSession() {
    const session = this.session;
    if (!session) {
      return null;
    }
    if (session.status === "closed") {
      return this.getSession();
    }

    session.status = "closing";
    session.updatedAt = nowIso();
    this.pushEvent(session.id, {
      eventType: "terminal_status",
      stream: "system",
      data: "Closing terminal...\n",
    });

    try {
      session.child.kill("SIGTERM");
    } catch (error) {
      const message = textValue(error?.message || "");
      if (message) {
        this.pushEvent(session.id, {
          eventType: "terminal_output",
          stream: "stderr",
          data: `${message}\n`,
        });
      }
    }

    return this.getSession();
  }

  pushEvent(sessionId, {
    eventType,
    stream = "system",
    data = "",
    exitCode = null,
  }) {
    const session = this.session;
    if (!session || session.id !== sessionId) {
      return null;
    }

    const event = {
      id: session.nextEventId,
      sessionId: session.id,
      eventType: String(eventType || "").trim() || "terminal_output",
      stream: String(stream || "").trim() || "system",
      data: String(data || ""),
      createdAt: nowIso(),
      exitCode: exitCode === null ? null : Number(exitCode),
    };
    session.nextEventId += 1;
    session.updatedAt = event.createdAt;

    if (event.eventType === "terminal_output" && !event.data) {
      return null;
    }

    session.events.push(event);
    if (session.events.length > MAX_BUFFERED_EVENTS) {
      session.events.splice(0, session.events.length - MAX_BUFFERED_EVENTS);
    }

    this.eventEmitter.emit("event", cloneEvent(event));
    return cloneEvent(event);
  }
}
