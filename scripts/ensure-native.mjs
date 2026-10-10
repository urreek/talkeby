import { createRequire } from "node:module";
import { requireCommand } from "./setup/process.mjs";

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
  requireCommand("npm", ["rebuild", "better-sqlite3"]);
}

function verifyDatabase() {
  const Database = require("better-sqlite3");
  const database = new Database(":memory:");
  database.close();
}

try {
  verifyDatabase();
} catch (error) {
  if (!shouldRebuild(error)) {
    throw error;
  }

  // eslint-disable-next-line no-console
  console.log("[talkeby] Rebuilding better-sqlite3 for current Node runtime...");
  runRebuild();

  // Validate that rebuild succeeded for this runtime.
  verifyDatabase();
}

