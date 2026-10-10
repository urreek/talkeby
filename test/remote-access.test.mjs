import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { remoteOrigin, remoteAllowedHosts, remoteSettings } from "../shared/remote-access.mjs";
import { updateEnvironment } from "../scripts/setup/environment.mjs";
import { assertServePortAvailable, tailscaleHostname, tunnelSpec } from "../scripts/remote/providers.mjs";
import { RemoteSupervisor, assertPortFree, waitForHttp } from "../scripts/remote/supervisor.mjs";
import net from "node:net";

const configured = { APP_ACCESS_KEY: "fixture-owner", TALKEBY_REMOTE_PROVIDER: "tailscale", TALKEBY_PUBLIC_URL: "https://dev.example.ts.net" };

test("remote settings preserve fixed ports and allow only an exact HTTPS hostname", () => {
  const settings = remoteSettings({ ...configured, PORT: "3200", WEB_PORT: "5200", TALKEBY_WEB_PORT: "5300" });
  assert.equal(settings.apiPort, 3200);
  assert.equal(settings.target, "http://127.0.0.1:5300");
  assert.deepEqual(remoteAllowedHosts("https://DEV.example.ts.net:8443/"), ["dev.example.ts.net"]);
  assert.deepEqual(remoteAllowedHosts(""), []);
  assert.equal(remoteOrigin("https://talkeby.example.com/"), "https://talkeby.example.com");
  for (const value of ["http://example.com", "https://user:secret@example.com", "https://*.example.com", "https://example.com/path", "https://example.com?token=secret", "https://example.com#secret", "invalid"]) {
    assert.throws(() => remoteOrigin(value), /HTTPS hostname/);
  }
});

test("remote start rejects missing login, temporary tunnels and incompatible ports", () => {
  assert.throws(() => remoteSettings({}), /remote:setup/);
  assert.throws(() => remoteSettings({ ...configured, APP_ACCESS_KEY: "" }), /APP_ACCESS_KEY/);
  assert.throws(() => remoteSettings({ ...configured, WEB_PORT: "3000" }), /different/);
  assert.throws(() => remoteSettings({ ...configured, PORT: "3000x" }), /between/);
  assert.throws(() => remoteSettings({ ...configured, TALKEBY_TAILSCALE_PORT: "8443" }), /address\/port changed/);
  const cloudflare = { ...configured, TALKEBY_REMOTE_PROVIDER: "cloudflare", TALKEBY_PUBLIC_URL: "https://talkeby.example.com", CLOUDFLARE_TUNNEL_TOKEN: "fixture-token" };
  assert.equal(remoteSettings(cloudflare).provider, "cloudflare");
  assert.throws(() => remoteSettings({ ...cloudflare, CLOUDFLARE_TUNNEL_TOKEN: "" }), /named tunnel token/);
  assert.throws(() => remoteSettings({ ...cloudflare, TALKEBY_PUBLIC_URL: "https://random.trycloudflare.com" }), /named tunnel token/);
});

test("provider selection uses private foreground Serve and environment-only Cloudflare credentials", () => {
  const tailscale = tunnelSpec(remoteSettings(configured), configured, "tailscale");
  assert.deepEqual(tailscale.args, ["serve", "--https=443", "http://127.0.0.1:5173"]);
  const env = { ...configured, TALKEBY_REMOTE_PROVIDER: "cloudflare", TALKEBY_PUBLIC_URL: "https://talkeby.example.com", CLOUDFLARE_TUNNEL_TOKEN: "fixture-secret" };
  const cloudflare = tunnelSpec(remoteSettings(env), env, "cloudflared");
  assert.equal(cloudflare.env.TUNNEL_TOKEN, env.CLOUDFLARE_TUNNEL_TOKEN);
  assert.equal(cloudflare.args.join(" ").includes(env.CLOUDFLARE_TUNNEL_TOKEN), false);
  assert.deepEqual(cloudflare.args, ["tunnel", "--no-autoupdate", "run"]);
});

test("Tailscale setup discovers stable addresses and preserves existing Serve services", () => {
  assert.equal(tailscaleHostname({ BackendState: "Running", Self: { DNSName: "dev.example.ts.net." } }), "dev.example.ts.net");
  assert.throws(() => tailscaleHostname({ BackendState: "NeedsLogin" }), /Sign in/);
  assertServePortAvailable(null, 443);
  assertServePortAvailable({ TCP: { "443": { HTTPS: true } } }, 8443);
  assert.throws(() => assertServePortAvailable({ TCP: { "443": { HTTPS: true } } }, 443), /already uses/);
  assert.throws(() => assertServePortAvailable({ Web: { "dev.example.ts.net:443": {} } }, 443), /already uses/);
});

test("switching remote providers persists the choice without altering credentials or local settings", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talkeby remote config "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, ".env"), '# custom\nAPP_ACCESS_KEY="fixture-owner"\nPORT=3200\nTALKEBY_REMOTE_PROVIDER=cloudflare\nTALKEBY_REMOTE_PROVIDER=cloudflare\nCLOUDFLARE_TUNNEL_TOKEN="fixture-token"\n');
  const env = updateEnvironment(directory, { TALKEBY_REMOTE_PROVIDER: "tailscale", TALKEBY_PUBLIC_URL: configured.TALKEBY_PUBLIC_URL });
  assert.equal(env.TALKEBY_REMOTE_PROVIDER, "tailscale");
  assert.equal(env.APP_ACCESS_KEY, "fixture-owner");
  assert.equal(env.CLOUDFLARE_TUNNEL_TOKEN, "fixture-token");
  assert.equal(env.PORT, "3200");
  assert.ok(fs.readFileSync(path.join(directory, ".env"), "utf8").startsWith("# custom"));
});

test("supervisor cleans all owned children on launch failure, exit and cancellation", async () => {
  for (const failure of ["error", "exit", "cancel"]) {
    const killed = [];
    const children = [];
    const supervisor = new RemoteSupervisor({ spawnProcess: () => {
      const child = new EventEmitter();
      child.pid = children.length + 1;
      children.push(child);
      return child;
    }, killTree: (child) => killed.push(child.pid) });
    supervisor.launch("backend", process.execPath, [], {});
    supervisor.launch("web", process.execPath, [], {});
    if (failure === "cancel") supervisor.stop();
    else children[1].emit(failure, failure === "exit" ? 1 : new Error("private details"));
    const error = await supervisor.done;
    assert.deepEqual(killed, [2, 1]);
    assert.equal(supervisor.abort.signal.aborted, true);
    assert.throws(() => supervisor.launch("tunnel", process.execPath, [], {}));
    if (failure !== "cancel") assert.ok(error);
    assert.equal(String(error).includes("private details"), false);
    supervisor.stop();
    assert.equal(killed.length, 2);
  }
});

test("readiness rejects occupied ports and stops immediately on cancellation", async (t) => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(assertPortFree(server.address().port), /occupied/);
  const abort = new AbortController();
  abort.abort(new Error("cancelled"));
  await assert.rejects(waitForHttp("http://127.0.0.1:1", abort.signal), /cancelled/);
});
