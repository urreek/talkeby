import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run, setCopilotSpawnCompatForTests } from "../src/runners/copilot.mjs";

function createMockCopilotSpawn(onSpawn) {
  return (binary, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    Promise.resolve(onSpawn({ binary, args, options }))
      .then((payload) => {
        const line = JSON.stringify(payload || { message: "ok" });
        child.stdout.write(`${line}\n`);
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 0);
      })
      .catch((error) => {
        child.stderr.write(`${String(error?.message || error)}\n`);
        child.stderr.end();
        child.stdout.end();
        child.emit("close", 1);
      });

    return child;
  };
}

function createRawOutputCopilotSpawn({ stdout = "", stderr = "", exitCode = 0 }) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    queueMicrotask(() => {
      if (stdout) {
        child.stdout.write(stdout);
      }
      if (stderr) {
        child.stderr.write(stderr);
      }
      child.stdout.end();
      child.stderr.end();
      child.emit("close", exitCode);
    });

    return child;
  };
}

test("Copilot uses a temporary config dir for non-default reasoning effort", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-copilot-runner-"));
  const copilotHome = path.join(tempDir, "copilot-home");
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(copilotHome, { recursive: true });
  await fs.mkdir(workdir, { recursive: true });
  await fs.writeFile(
    path.join(copilotHome, "config.json"),
    `${JSON.stringify({ theme: "dark" }, null, 2)}\n`,
    "utf8",
  );

  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = copilotHome;

  let observed = null;
  setCopilotSpawnCompatForTests(createMockCopilotSpawn(async ({ args }) => {
    const configDirIndex = args.indexOf("--config-dir");
    assert.notEqual(configDirIndex, -1);
    const configDir = args[configDirIndex + 1];
    const config = JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8"));
    observed = {
      configDir,
      config,
      args,
    };
    return { message: "runner ok" };
  }));

  try {
    const result = await run({
      task: "test high reasoning",
      workdir,
      model: "openai/gpt-4.1",
      reasoningEffort: "high",
      timeoutMs: 5000,
      binary: "copilot",
    });

    assert.equal(result.message, "runner ok");
    assert.ok(observed);
    assert.equal(observed.config.reasoning_effort, "high");
    assert.equal(observed.config.theme, "dark");
    assert.equal(observed.args.includes("--model"), true);
  } finally {
    setCopilotSpawnCompatForTests();
    if (previousHome === undefined) {
      delete process.env.COPILOT_HOME;
    } else {
      process.env.COPILOT_HOME = previousHome;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("Copilot runner parses concatenated assistant events and keeps only assistant text", async () => {
  const deltasAndMessage = [
    "{\"type\":\"assistant.message_delta\",\"data\":{\"messageId\":\"msg-1\",\"deltaContent\":\"Hello\"}}",
    "{\"type\":\"assistant.message_delta\",\"data\":{\"messageId\":\"msg-1\",\"deltaContent\":\" world\"}}",
    "{\"type\":\"assistant.message\",\"data\":{\"messageId\":\"msg-1\",\"content\":\"Hello world\"}}",
    "{\"type\":\"assistant.turn_end\",\"data\":{\"turnId\":\"9\"}}",
  ].join(" ");

  const observedLines = [];
  setCopilotSpawnCompatForTests(createRawOutputCopilotSpawn({
    stdout: `${deltasAndMessage}\n`,
  }));

  try {
    const result = await run({
      task: "test concatenated events",
      workdir: process.cwd(),
      timeoutMs: 5000,
      binary: "copilot",
      onLine: (line) => observedLines.push(line),
    });

    assert.equal(result.message, "Hello world");
    assert.deepEqual(observedLines, ["Hello world"]);
  } finally {
    setCopilotSpawnCompatForTests();
  }
});

test("Copilot runner reconstructs assistant text from deltas when final assistant message is absent", async () => {
  const deltaOnly = [
    "{\"type\":\"assistant.message_delta\",\"data\":{\"messageId\":\"msg-2\",\"deltaContent\":\"Need\"}}",
    "{\"type\":\"assistant.message_delta\",\"data\":{\"messageId\":\"msg-2\",\"deltaContent\":\" fix\"}}",
  ].join(" ");

  setCopilotSpawnCompatForTests(createRawOutputCopilotSpawn({
    stdout: `${deltaOnly}\n`,
  }));

  try {
    const result = await run({
      task: "test delta fallback",
      workdir: process.cwd(),
      timeoutMs: 5000,
      binary: "copilot",
    });

    assert.equal(result.message, "Need fix");
  } finally {
    setCopilotSpawnCompatForTests();
  }
});
