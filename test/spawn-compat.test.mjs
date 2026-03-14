import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { resolveSpawnCompat, spawnCompat } from "../src/lib/spawn-compat.mjs";

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Child exited with code ${code}`));
    });
  });
}

test("resolveSpawnCompat routes Windows .cmd scripts through cmd.exe", { skip: process.platform !== "win32" }, async () => {
  const resolved = resolveSpawnCompat(
    "C:/Users/example/AppData/Roaming/npm/codex.cmd",
    ["exec", "resume", "session-id", "remember me"],
  );

  assert.match(String(resolved.command), /cmd(.exe)?$/i);
  assert.deepEqual(
    resolved.args,
    ["/d", "/c", "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd", "exec", "resume", "session-id", "remember me"],
  );
  assert.equal(resolved.options.shell, false);
});

test("spawnCompat preserves spaced arguments for Windows .cmd scripts", { skip: process.platform !== "win32" }, async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-spawn-compat-"));
  const scriptPath = path.join(tempDir, "echo-args.cmd");
  const outputPath = path.join(tempDir, "args.txt");

  await fs.writeFile(scriptPath, [
    "@echo off",
    `> \"${outputPath}\" (
  echo ARG1=%~1
  echo ARG2=%~2
  echo ARG3=%~3
  echo ARG4=%~4
)`,
  ].join("\r\n"));

  const child = spawnCompat(scriptPath, ["one", "two words", "three", "four five"], {
    cwd: tempDir,
    stdio: ["ignore", "ignore", "ignore"],
  });
  await waitForChild(child);

  const output = await fs.readFile(outputPath, "utf8");
  assert.match(output, /ARG1=one/);
  assert.match(output, /ARG2=two words/);
  assert.match(output, /ARG3=three/);
  assert.match(output, /ARG4=four five/);
});
