import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareEnvironment } from "../scripts/setup/environment.mjs";
import { runSetup } from "../scripts/setup/onboarding.mjs";
import { commandSpec, runCommand } from "../scripts/setup/process.mjs";

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "talkeby setup "));
  fs.copyFileSync(new URL("../.env.example", import.meta.url), path.join(rootDir, ".env.example"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  return rootDir;
}

test("setup creates portable paths, private authentication and safe working defaults", (t) => {
  const rootDir = fixture(t);
  const first = prepareEnvironment(rootDir);
  assert.equal(first.env.DATA_DIR, "./data");
  assert.equal(first.env.DATABASE_FILE, "./data/talkeby.db");
  assert.equal(path.resolve(rootDir, first.env.WORKSPACE_DIR), rootDir);
  assert.equal(first.env.DEFAULT_EXECUTION_MODE, "interactive");
  assert.equal(first.env.RUNTIME_POLICY_ENABLED, "false");
  assert.equal(first.env.PROJECTS, "talkeby=.");
  assert.match(first.env.APP_ACCESS_KEY, /^[\w-]{43}$/);
  const before = fs.readFileSync(first.envPath, "utf8");
  const second = prepareEnvironment(rootDir);
  assert.equal(second.env.APP_ACCESS_KEY, first.env.APP_ACCESS_KEY);
  assert.equal(fs.readFileSync(second.envPath, "utf8"), before);
  assert.ok(fs.statSync(path.join(rootDir, "data")).isDirectory());
  if (process.platform !== "win32") assert.equal(fs.statSync(first.envPath).mode & 0o777, 0o600);
});

test("setup preserves custom configuration, quoted secrets and comments", (t) => {
  const rootDir = fixture(t);
  fs.writeFileSync(path.join(rootDir, ".env"), '# custom settings\nAPP_ACCESS_KEY="custom # key"\nAI_PROVIDER=claude\nWORKSPACE_DIR="."\nDATA_DIR=./custom\nDATABASE_FILE=./custom/database.db\nDEFAULT_EXECUTION_MODE=auto\nRUNTIME_POLICY_ENABLED=true\n');
  const result = prepareEnvironment(rootDir);
  assert.equal(result.env.APP_ACCESS_KEY, "custom # key");
  assert.equal(result.env.AI_PROVIDER, "claude");
  assert.equal(result.env.DEFAULT_EXECUTION_MODE, "auto");
  assert.equal(result.env.RUNTIME_POLICY_ENABLED, "true");
  assert.equal(result.env.DATABASE_FILE, "./custom/database.db");
  assert.ok(fs.readFileSync(result.envPath, "utf8").startsWith("# custom settings"));
});

test("setup repairs duplicated placeholder keys and preserves a legacy workspace", (t) => {
  const rootDir = fixture(t);
  fs.writeFileSync(path.join(rootDir, ".env"), `APP_ACCESS_KEY=choose-a-long-random-secret\nAPP_ACCESS_KEY=replace-me\nCODEX_WORKDIR=${JSON.stringify(rootDir.replaceAll("\\", "/"))}\n`);
  const result = prepareEnvironment(rootDir);
  assert.match(result.env.APP_ACCESS_KEY, /^[\w-]{43}$/);
  assert.equal(path.resolve(result.env.WORKSPACE_DIR), rootDir);
});

test("one-command setup installs missing Codex, reuses authentication and does not print secrets", (t) => {
  const rootDir = fixture(t);
  const calls = [];
  const messages = [];
  let installed = false;
  runSetup({ rootDir, interactive: false, locate: () => installed ? "codex" : "", log: (message) => messages.push(message),
    run: (command, args) => {
      calls.push([command, args]);
      if (args.includes("--global")) installed = true;
      return { status: 0 };
    },
  });
  assert.deepEqual(calls[0], ["npm", ["ci"]]);
  assert.ok(calls.some(([, args]) => args.includes("@openai/codex")));
  assert.ok(calls.some(([, args]) => args.join(" ") === "login status"));
  assert.equal(calls.some(([, args]) => args.join(" ") === "login"), false);
  const { env } = prepareEnvironment(rootDir);
  assert.equal(messages.join("\n").includes(env.APP_ACCESS_KEY), false);
});

test("setup guides interactive sign-in and verifies it succeeded", (t) => {
  const rootDir = fixture(t);
  const calls = [];
  let signedIn = false;
  runSetup({ rootDir, interactive: true, locate: () => "codex", log: () => {}, run: (_, args) => {
    calls.push(args.join(" "));
    if (args.join(" ") === "login") signedIn = true;
    return { status: args.join(" ") === "login status" && !signedIn ? 1 : 0 };
  } });
  assert.equal(calls.filter((call) => call === "login").length, 1);
  assert.equal(calls.filter((call) => call === "login status").length, 2);
});

test("setup fails clearly instead of hanging when noninteractive authentication is missing", (t) => {
  const rootDir = fixture(t);
  const calls = [];
  assert.throws(() => runSetup({ rootDir, interactive: false, locate: () => "codex", log: () => {}, run: (_, args) => {
    calls.push(args.join(" "));
    return { status: args.join(" ") === "login status" ? 1 : 0 };
  } }), /Run codex login in a terminal/);
  assert.equal(calls.includes("login"), false);
  assert.equal(calls.some((call) => call.includes("ensure-native")), false);
});

test("setup stops on dependency failure and preserves an incompatible existing policy", (t) => {
  const rootDir = fixture(t);
  assert.throws(() => runSetup({ rootDir, locate: () => "codex", log: () => {}, run: () => ({ status: 1 }) }), /Dependency installation failed/);
  fs.appendFileSync(path.join(rootDir, ".env"), "\nRUNTIME_POLICY_ENABLED=true\n");
  assert.throws(() => runSetup({ rootDir, run: () => assert.fail("must not install"), log: () => {} }), /existing setting was preserved/);
  assert.equal(prepareEnvironment(rootDir).env.RUNTIME_POLICY_ENABLED, "true");
});

test("unsupported Node and missing workspaces fail before installing dependencies", (t) => {
  const rootDir = fixture(t);
  assert.throws(() => runSetup({ rootDir, version: "20.18.0" }), /Install Node/);
  assert.equal(fs.existsSync(path.join(rootDir, ".env")), false);
  fs.writeFileSync(path.join(rootDir, ".env"), "WORKSPACE_DIR=./missing\n");
  assert.throws(() => runSetup({ rootDir, run: () => assert.fail("must not install") }), /existing folder/);
});

test("npm subprocesses run through npm's JavaScript entry point when available", () => {
  const previous = process.env.npm_execpath;
  try {
    process.env.npm_execpath = path.join(os.tmpdir(), "npm with spaces", "npm-cli.js");
    const spec = commandSpec("npm", ["ci"], { cwd: process.cwd() });
    assert.equal(spec.command, process.execPath);
    assert.deepEqual(spec.args, [process.env.npm_execpath, "ci"]);
  } finally {
    if (previous === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previous;
  }
});

test("npm can be launched from Node on the current platform", () => {
  const result = runCommand("npm", ["--version"], { stdio: "pipe", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});
