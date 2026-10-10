import { fileURLToPath } from "node:url";
import { runSetup } from "./setup/onboarding.mjs";

try {
  runSetup({ rootDir: fileURLToPath(new URL("../", import.meta.url)) });
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}
