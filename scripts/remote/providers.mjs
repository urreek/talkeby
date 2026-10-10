import path from "node:path";
import { findBinary, runCommand, requireCommand } from "../setup/process.mjs";

export const providerInfo = {
  tailscale: { command: "tailscale", key: "TALKEBY_TAILSCALE_BINARY", packageId: "Tailscale.Tailscale", docs: "https://tailscale.com/download" },
  cloudflare: { command: "cloudflared", key: "CLOUDFLARED_BINARY", packageId: "Cloudflare.cloudflared", docs: "https://developers.cloudflare.com/tunnel/downloads/" },
};

export function providerBinary(provider, env, rootDir) {
  const info = providerInfo[provider];
  const configured = env[info.key];
  if (configured) return findBinary(configured, rootDir);
  const discovered = findBinary(info.command, rootDir);
  if (discovered || process.platform !== "win32") return discovered;
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  const folder = provider === "tailscale" ? "Tailscale" : "cloudflared";
  return roots.map((root) => findBinary(path.join(root, folder, `${info.command}.exe`))).find(Boolean) || "";
}

export async function ensureProvider(provider, env, rootDir, ask) {
  const info = providerInfo[provider];
  let binary = providerBinary(provider, env, rootDir);
  if (!binary && !env[info.key] && process.platform === "win32" && findBinary("winget")) {
    if (/^y(es)?$/i.test(await ask(`Install ${info.command} with winget? [Y/n] `, "y"))) {
      requireCommand("winget", ["install", "--id", info.packageId, "--exact", "--accept-package-agreements", "--accept-source-agreements"], { cwd: rootDir });
      binary = providerBinary(provider, env, rootDir);
    }
  }
  if (!binary) throw new Error(`Install ${info.command}: ${info.docs} Then rerun remote setup. Optional path override: ${info.key} in .env.`);
  return binary;
}

function readJson(binary, args, rootDir, label) {
  const result = runCommand(binary, args, { cwd: rootDir, encoding: "utf8", stdio: "pipe", timeout: 15_000 });
  if (result.status !== 0) throw new Error(`${label} failed. Make sure Tailscale is running and signed in, then try again.`);
  try { return JSON.parse(result.stdout); } catch { throw new Error(`${label} returned invalid JSON. Update Tailscale and try again.`); }
}

export function tailscaleStatus(binary, rootDir) {
  return readJson(binary, ["status", "--json"], rootDir, "Tailscale status");
}

export function tailscaleHostname(status) {
  const hostname = status.Self?.DNSName?.replace(/\.$/, "");
  if (status.BackendState !== "Running" || !hostname?.endsWith(".ts.net")) {
    throw new Error("Sign in to Tailscale and enable MagicDNS/HTTPS for your tailnet, then rerun remote setup.");
  }
  return hostname;
}

export function assertServePortAvailable(status, port) {
  // Never replace an existing app, even when its proxy target happens to match.
  if (status?.TCP?.[String(port)] || Object.keys(status?.Web || {}).some((host) => host.endsWith(`:${port}`))) {
    throw new Error(`Tailscale Serve already uses HTTPS port ${port}. Choose another port in remote setup, or stop the existing service first.`);
  }
}

export function checkServePort(binary, rootDir, port) {
  assertServePortAvailable(readJson(binary, ["serve", "status", "--json"], rootDir, "Tailscale Serve status"), port);
}

export function tunnelSpec(settings, env, binary) {
  if (settings.provider === "tailscale") {
    return { command: binary, args: ["serve", `--https=${settings.httpsPort}`, settings.target], env: {} };
  }
  // Token is never a command argument and no quick-tunnel fallback is allowed (SSE).
  return { command: binary, args: ["tunnel", "--no-autoupdate", "run"], env: { TUNNEL_TOKEN: env.CLOUDFLARE_TUNNEL_TOKEN } };
}
