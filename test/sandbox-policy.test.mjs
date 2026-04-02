import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSandboxDoctorCheck,
  parseSandboxMode,
} from "../src/services/sandbox-policy.mjs";

test("parseSandboxMode accepts the supported Codex sandbox values", () => {
  assert.equal(parseSandboxMode("read-only"), "read-only");
  assert.equal(parseSandboxMode("workspace-write"), "workspace-write");
  assert.equal(parseSandboxMode("danger-full-access"), "danger-full-access");
});

test("parseSandboxMode rejects invalid values", () => {
  assert.throws(
    () => parseSandboxMode("machine-admin"),
    /Invalid CODEX_SANDBOX_MODE/,
  );
});

test("buildSandboxDoctorCheck flags danger-full-access with auto mode", () => {
  const check = buildSandboxDoctorCheck({
    sandboxMode: "danger-full-access",
    executionMode: "auto",
  });

  assert.equal(check.id, "codex_sandbox_mode");
  assert.equal(check.ok, false);
  assert.equal(check.severity, "error");
});
