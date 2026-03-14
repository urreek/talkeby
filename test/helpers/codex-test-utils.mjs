import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function timestampParts(date = new Date()) {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

function buildSessionRows({ sessionId, workdir, taskMessages, originator = "talkeby" }) {
  const now = new Date().toISOString();
  const rows = [
    {
      timestamp: now,
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: now,
        cwd: workdir,
        originator,
      },
    },
  ];

  for (const message of taskMessages) {
    rows.push({
      timestamp: now,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    });
    rows.push({
      timestamp: now,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: `reply:${message}`,
          },
        ],
      },
    });
  }

  return rows;
}

export async function createTalkebySessionFile({
  homeDir,
  sessionId,
  workdir,
  taskMessages = [],
  createdAt = new Date(),
  originator = "talkeby",
}) {
  const { year, month, day } = timestampParts(createdAt);
  const sessionsDir = path.join(homeDir, ".codex", "sessions", year, month, day);
  await fs.mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(
    sessionsDir,
    `rollout-${createdAt.toISOString().replace(/[:.]/g, "-")}-${sessionId}.jsonl`,
  );
  const rows = buildSessionRows({
    sessionId,
    workdir,
    taskMessages,
    originator,
  });
  await fs.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await fs.utimes(filePath, createdAt, createdAt);
  return filePath;
}

export function createMockCodexSpawn() {
  return (command, args, options = {}) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};

    const normalizedArgs = Array.isArray(args) ? args.map((value) => String(value)) : [];
    const stdinChunks = [];
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;

      Promise.resolve().then(async () => {
        const outputIndex = normalizedArgs.indexOf("--output-last-message");
        const outputPath = outputIndex >= 0 ? normalizedArgs[outputIndex + 1] : "";
        const promptFromArgs = normalizedArgs.at(-1) === "-" ? "" : (normalizedArgs.at(-1) || "");
        const prompt = stdinChunks.length > 0
          ? Buffer.concat(stdinChunks).toString("utf8")
          : promptFromArgs;
        const logPath = process.env.FAKE_CODEX_LOG || "";
        const workdir = process.env.FAKE_CODEX_WORKDIR || options.cwd || process.cwd();
        const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();

        if (logPath) {
          await fs.writeFile(logPath, JSON.stringify({ binary: command, args: normalizedArgs, prompt }, null, 2));
        }
        if (outputPath) {
          await fs.writeFile(outputPath, process.env.FAKE_CODEX_MESSAGE || "fake-codex-message");
        }
        if (process.env.FAKE_CODEX_FALLBACK_SESSION_ID) {
          await createTalkebySessionFile({
            homeDir,
            sessionId: process.env.FAKE_CODEX_FALLBACK_SESSION_ID,
            workdir,
            taskMessages: [process.env.FAKE_CODEX_FALLBACK_PROMPT || prompt],
            originator: process.env.FAKE_CODEX_FALLBACK_ORIGINATOR || "codex_exec",
          });
        }
        if (process.env.FAKE_CODEX_STDOUT) {
          child.stdout.emit("data", Buffer.from(process.env.FAKE_CODEX_STDOUT));
        }
        if (process.env.FAKE_CODEX_STDERR) {
          child.stderr.emit("data", Buffer.from(process.env.FAKE_CODEX_STDERR));
        }
        if (process.env.FAKE_CODEX_SESSION_ID) {
          child.stderr.emit("data", Buffer.from(`session id: ${process.env.FAKE_CODEX_SESSION_ID}\n`));
        }
        child.emit("close", Number(process.env.FAKE_CODEX_EXIT_CODE || 0));
      }).catch((error) => {
        child.emit("error", error);
      });
    };

    child.stdin = {
      write(chunk) {
        if (chunk !== undefined && chunk !== null) {
          stdinChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        return true;
      },
      end(chunk) {
        if (chunk !== undefined && chunk !== null) {
          this.write(chunk);
        }
        finish();
      },
    };

    if (normalizedArgs.at(-1) !== "-") {
      finish();
    }

    return child;
  };
}

export async function createFakeCodexBinary(tempDir, workdir = tempDir) {
  const scriptPath = path.join(workdir, "exec");
  const scriptLines = [
    'process.stdout.write("mock codex placeholder\\n");',
  ];
  await fs.writeFile(scriptPath, `${scriptLines.join("\n")}\n`);
  return process.execPath;
}

export async function withTemporaryHome(tempDir, callback) {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
    return await callback();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

