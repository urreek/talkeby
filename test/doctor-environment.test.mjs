import test from "node:test";
import assert from "node:assert/strict";
import { environmentMap, environmentBoolean, environmentPort } from "../scripts/setup/env-values.mjs";

test("doctor reads quoted setup values, Windows paths and comments using runtime dotenv semantics", () => {
  const env = environmentMap('PORT="3003"\nWEB_PORT="5173"\nWORKSPACE_DIR="C:/workspace with spaces"\nAPP_ACCESS_KEY="fixture # key"\nCODEX_BINARY="codex"\nCODEX_PARITY_MODE="true"\nCODEX_DISABLE_SESSION_RESUME="false"\n');
  assert.equal(env.get("WORKSPACE_DIR"), "C:/workspace with spaces");
  assert.equal(env.get("APP_ACCESS_KEY"), "fixture # key");
  assert.equal(env.get("CODEX_BINARY"), "codex");
  assert.equal(environmentPort(env, "backend"), 3003);
  assert.equal(environmentPort(env, "web"), 5173);
  assert.equal(environmentBoolean(env.get("CODEX_PARITY_MODE"), false), true);
  assert.equal(environmentBoolean(env.get("CODEX_DISABLE_SESSION_RESUME"), true), false);
});

test("doctor matches runtime environment precedence and rejects invalid fixed ports", () => {
  const env = environmentMap('PORT=3000\nWEB_PORT=5173\nTALKEBY_WEB_PORT=5300\n', { PORT: "3003", TALKEBY_WEB_PORT: "5400" });
  assert.equal(environmentPort(env, "backend"), 3003);
  assert.equal(environmentPort(env, "web"), 5400);
  env.set("TALKEBY_WEB_PORT", " ");
  assert.equal(environmentPort(env, "web"), 5173);
  for (const value of ["3003x", "0", "65536", "-1"]) {
    env.set("PORT", value);
    assert.throws(() => environmentPort(env, "backend"), /between/);
  }
  assert.equal(environmentBoolean(undefined, true), true);
  assert.equal(environmentBoolean("off", true), false);
});
