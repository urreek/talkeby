export function remoteOrigin(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { /* Report without echoing input. */ }
  if (!url || url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/i.test(url.hostname)) {
    throw new Error("TALKEBY_PUBLIC_URL must be an HTTPS hostname, without credentials, a path, or query parameters.");
  }
  return url.origin;
}

export function remotePort(value, fallback, label) {
  const text = String(value || fallback).trim();
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) {
    throw new Error(`${label} must be a port between 1 and 65535.`);
  }
  return Number(text);
}

export function remoteSettings(env) {
  const provider = env.TALKEBY_REMOTE_PROVIDER;
  if (!["tailscale", "cloudflare"].includes(provider)) {
    throw new Error("Choose remote access first: npm run remote:setup");
  }
  if (!env.APP_ACCESS_KEY?.trim()) throw new Error("Remote access requires APP_ACCESS_KEY. Run npm run setup first.");
  const publicUrl = remoteOrigin(env.TALKEBY_PUBLIC_URL);
  const httpsPort = remotePort(env.TALKEBY_TAILSCALE_PORT, 443, "TALKEBY_TAILSCALE_PORT");
  if (provider === "tailscale" && (!new URL(publicUrl).hostname.endsWith(".ts.net") ||
      Number(new URL(publicUrl).port || 443) !== httpsPort)) {
    throw new Error("Tailscale address/port changed. Rerun npm run remote:setup -- tailscale.");
  }
  if (provider === "cloudflare" && (!env.CLOUDFLARE_TUNNEL_TOKEN?.trim() || new URL(publicUrl).port || new URL(publicUrl).hostname.endsWith(".trycloudflare.com"))) {
    throw new Error("Cloudflare requires a named tunnel token and an HTTPS hostname on port 443. Run npm run remote:setup -- cloudflare.");
  }
  const apiPort = remotePort(env.PORT, 3000, "PORT");
  const webPort = remotePort(env.TALKEBY_WEB_PORT?.trim() || env.WEB_PORT, 5173, "WEB_PORT");
  if (apiPort === webPort) throw new Error("PORT and WEB_PORT must be different.");
  return { provider, publicUrl, httpsPort, apiPort, webPort, target: `http://127.0.0.1:${webPort}` };
}

export function remoteAllowedHosts(value) {
  return value?.trim() ? [new URL(remoteOrigin(value)).hostname] : [];
}
