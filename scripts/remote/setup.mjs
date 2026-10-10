import { prepareEnvironment, updateEnvironment } from "../setup/environment.mjs";
import { requireCommand } from "../setup/process.mjs";
import { remoteOrigin, remotePort, remoteSettings } from "../../shared/remote-access.mjs";
import { ensureProvider, tailscaleStatus, tailscaleHostname, checkServePort } from "./providers.mjs";
import { ask } from "./prompts.mjs";

async function setupTailscale(binary, env, rootDir) {
  let status = tailscaleStatus(binary, rootDir);
  if (status.BackendState === "NeedsLogin" || status.BackendState === "Stopped") {
    console.log("Follow Tailscale's sign-in prompt. Existing tailnet settings remain managed by Tailscale.");
    requireCommand(binary, ["up"], { cwd: rootDir });
    status = tailscaleStatus(binary, rootDir);
  }
  const hostname = tailscaleHostname(status);
  const port = remotePort(await ask("Tailscale HTTPS port [443]: ", env.TALKEBY_TAILSCALE_PORT || "443"), 443, "Tailscale HTTPS port");
  checkServePort(binary, rootDir, port);
  console.log("On first start, follow the Tailscale link to enable HTTPS if requested. Install Tailscale on your phone and sign in to the same tailnet.");
  return { TALKEBY_PUBLIC_URL: `https://${hostname}${port === 443 ? "" : `:${port}`}`, TALKEBY_TAILSCALE_PORT: String(port) };
}

async function setupCloudflare(env) {
  const webPort = remotePort(env.TALKEBY_WEB_PORT?.trim() || env.WEB_PORT, 5173, "WEB_PORT");
  console.log(`\nOne-time Cloudflare setup: https://one.dash.cloudflare.com/\n1. Create a named Cloudflare Tunnel (cloudflared) for a domain in your account.\n2. Add your public hostname with service HTTP -> http://127.0.0.1:${webPort}.\n3. Create an Access self-hosted application for that hostname, with an Allow policy limited to your email.\n4. Copy only the tunnel token from the connector installation command.\nGuide: https://developers.cloudflare.com/cloudflare-one/setup/secure-private-apps/private-web-app/\n`);
  const previous = env.TALKEBY_REMOTE_PROVIDER === "cloudflare" ? env.TALKEBY_PUBLIC_URL : "";
  const input = await ask(`Public HTTPS address${previous ? ` [${previous}]` : ""}: `, previous);
  const publicUrl = remoteOrigin(input.includes("://") ? input : `https://${input}`);
  if (new URL(publicUrl).port || new URL(publicUrl).hostname.endsWith(".trycloudflare.com")) {
    throw new Error("Use a named tunnel with your own hostname on HTTPS port 443. Quick tunnels do not support Talkeby's live events.");
  }
  const token = await ask(env.CLOUDFLARE_TUNNEL_TOKEN ? "Tunnel token (hidden; Enter keeps existing): " : "Tunnel token (hidden): ", env.CLOUDFLARE_TUNNEL_TOKEN || "", true);
  if (!token || /\s/.test(token)) throw new Error("Paste only the tunnel token, without the installation command.");
  if (!/^y(es)?$/i.test(await ask("Is this hostname routed to the service above and protected by your Access Allow policy? [y/N] ", "n"))) {
    throw new Error("Finish the hostname and Access setup in Cloudflare, then rerun this command. Settings were not changed.");
  }
  return { TALKEBY_PUBLIC_URL: publicUrl, CLOUDFLARE_TUNNEL_TOKEN: token };
}

export async function setupRemote(rootDir, selected) {
  const { env: saved } = prepareEnvironment(rootDir);
  const env = { ...saved, ...process.env };
  const provider = selected || await ask("Remote access: 1) Tailscale (private devices) 2) Cloudflare (browser access) [1]: ", "1");
  const choice = ({ "1": "tailscale", "2": "cloudflare" })[provider] || provider;
  if (!["tailscale", "cloudflare"].includes(choice)) throw new Error("Choose tailscale or cloudflare.");
  const binary = await ensureProvider(choice, env, rootDir, ask);
  const values = choice === "tailscale" ? await setupTailscale(binary, env, rootDir) : await setupCloudflare(env);
  const settings = remoteSettings({ ...env, ...values, TALKEBY_REMOTE_PROVIDER: choice });
  updateEnvironment(rootDir, { ...values, TALKEBY_REMOTE_PROVIDER: choice });
  console.log(`\nSaved ${choice} access: ${settings.publicUrl}\nStart with: npm run remote:start\nTalkeby login still uses APP_ACCESS_KEY in your local .env. Never share that file.`);
}
