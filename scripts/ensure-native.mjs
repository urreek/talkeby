import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function shouldRebuild(error) {
  const message = String(error?.message || "");
  if (!message) {
    return false;
  }
  return (
    message.includes("NODE_MODULE_VERSION")
    || message.includes("Could not locate the bindings file")
    || message.includes("ERR_DLOPEN_FAILED")
  );
}

function runRebuild() {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["rebuild", "better-sqlite3"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  require("better-sqlite3");
} catch (error) {
  if (!shouldRebuild(error)) {
    throw error;
  }

  // eslint-disable-next-line no-console
  console.log("[talkeby] Rebuilding better-sqlite3 for current Node runtime...");
  runRebuild();

  // Validate that rebuild succeeded for this runtime.
  require("better-sqlite3");
}

