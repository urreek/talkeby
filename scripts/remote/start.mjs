import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { remoteSettings } from "../../shared/remote-access.mjs";
import { requireCommand } from "../setup/process.mjs";
import { providerBinary, providerInfo, tailscaleStatus, tailscaleHostname, checkServePort, tunnelSpec } from "./providers.mjs";
import { RemoteSupervisor, assertPortFree, waitForHttp } from "./supervisor.mjs";

export async function startRemote(rootDir, expectedProvider) {
  const file = path.join(rootDir, ".env");
  if (!fs.existsSync(file)) throw new Error("Run npm run remote:setup first.");
  const env = { ...parseEnv(fs.readFileSync(file, "utf8")), ...process.env };
  const settings = remoteSettings(env);
  if (expectedProvider && settings.provider !== expectedProvider) throw new Error(`Choose ${expectedProvider} first: npm run remote:setup -- ${expectedProvider}`);
  const binary = providerBinary(settings.provider, env, rootDir);
  if (!binary) throw new Error(`Install ${providerInfo[settings.provider].command} or rerun npm run remote:setup.`);
  if (settings.provider === "tailscale") {
    const hostname = tailscaleHostname(tailscaleStatus(binary, rootDir));
    if (hostname !== new URL(settings.publicUrl).hostname) throw new Error("Tailscale device address changed. Rerun npm run remote:setup -- tailscale.");
    checkServePort(binary, rootDir, settings.httpsPort);
  }
  await Promise.all([assertPortFree(settings.apiPort), assertPortFree(settings.webPort)]);
  requireCommand("npm", ["run", "web:build"], { cwd: rootDir, env });
  requireCommand(process.execPath, ["scripts/ensure-native.mjs"], { cwd: rootDir, env });
  const supervisor = new RemoteSupervisor();
  const stop = () => supervisor.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    // Keep both local origins on loopback; only the HTTPS tunnel is reachable remotely.
    const runtimeEnv = { ...env, TALKEBY_BIND_HOST: "127.0.0.1", TALKEBY_API_ORIGIN: `http://127.0.0.1:${settings.apiPort}` };
    supervisor.launch("Talkeby backend", process.execPath, ["--env-file=.env", "src/server.mjs"], { cwd: rootDir, env: runtimeEnv });
    supervisor.launch("Talkeby web", process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1"], { cwd: path.join(rootDir, "web"), env: runtimeEnv });
    await Promise.all([
      waitForHttp(`http://127.0.0.1:${settings.apiPort}/health`, supervisor.abort.signal),
      waitForHttp(settings.target, supervisor.abort.signal),
    ]);
    const tunnel = tunnelSpec(settings, env, binary);
    supervisor.launch(settings.provider, tunnel.command, tunnel.args, { cwd: rootDir, env: { ...env, ...tunnel.env } });
    console.log(`\nTalkeby is ready locally. Connecting ${settings.provider}: ${settings.publicUrl}\nOpen that address after the connector reports ready. Press Ctrl+C to stop Talkeby and remote access.`);
    const error = await supervisor.done;
    if (error) throw error;
  } catch (error) {
    if (!supervisor.stopped) { supervisor.stop(); throw error; }
    const reason = await supervisor.done;
    if (reason) throw reason;
  } finally {
    supervisor.stop();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
