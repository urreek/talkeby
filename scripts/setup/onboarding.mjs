import path from "node:path";
import { prepareEnvironment } from "./environment.mjs";
import { findBinary, runCommand } from "./process.mjs";
import { checkProviderConfiguration, prepareProvider, requireSuccess } from "./provider.mjs";

export function runSetup({ rootDir, version = process.versions.node, interactive = Boolean(process.stdin.isTTY),
  run = runCommand, locate = findBinary, log = console.log } = {}) {
  const [major, minor] = version.split(".").map(Number);
  if (!(major > 20 || (major === 20 && minor >= 19))) throw new Error("Install Node.js >=20.19 before running setup.");
  const { env, envPath } = prepareEnvironment(rootDir);
  const config = checkProviderConfiguration(env);
  const mergedEnv = { ...env, ...process.env };
  const webPort = String(mergedEnv.TALKEBY_WEB_PORT || "").trim() || String(mergedEnv.WEB_PORT || "").trim();
  if (!/^\d+$/.test(webPort) || Number(webPort) < 1 || Number(webPort) > 65535) throw new Error("Set a valid WEB_PORT in .env (1–65535).");
  log("Installing backend and frontend dependencies from their lockfiles...");
  requireSuccess(run("npm", ["ci"], { cwd: rootDir }), "Dependency installation");
  prepareProvider({ config, rootDir, interactive, run, locate, log, env });
  requireSuccess(run(process.execPath, [path.join(rootDir, "scripts", "ensure-native.mjs")], { cwd: rootDir }), "SQLite check");
  log(`Ready: http://localhost:${Number(webPort)}`);
  log(`Your login key is saved as APP_ACCESS_KEY in ${envPath}.`);
  log("Run npm run dev:all to start. Add other project folders in Settings.");
}
