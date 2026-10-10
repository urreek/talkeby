import { fileURLToPath } from "node:url";
import { runSetup } from "./setup/onboarding.mjs";
import { setupRemote } from "./remote/setup.mjs";
import { startRemote } from "./remote/start.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
try {
  const [action, provider, ...extra] = process.argv.slice(2);
  if (extra.length || (provider && !["tailscale", "cloudflare"].includes(provider))) {
    throw new Error("Usage: npm run remote:setup -- tailscale|cloudflare, or npm run remote:start");
  }
  if (action === "setup") {
    runSetup({ rootDir });
    await setupRemote(rootDir, provider);
  } else if (action === "start") {
    await startRemote(rootDir, provider);
  } else {
    throw new Error("Use npm run remote:setup or npm run remote:start.");
  }
} catch (error) {
  console.error(`Remote access: ${error.message}`);
  process.exitCode = 1;
}
