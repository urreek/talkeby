import type { IncomingMessage, ServerResponse } from "node:http";
import net from "node:net";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { webPortOptions } from "./config/web-port";
import { shouldCacheApi } from "./config/api-cache";
import { remoteAllowedHosts, remotePort } from "../shared/remote-access.mjs";

function resolveBackendTarget(env: Record<string, string>) {
  const explicitTarget = env.TALKEBY_API_ORIGIN?.trim();
  if (explicitTarget) {
    return explicitTarget;
  }

  return `http://127.0.0.1:${remotePort(env.PORT, 3000, "PORT")}`;
}

type NextFunction = (error?: unknown) => void;

function parseBackendTarget(target: string) {
  try {
    const url = new URL(target);
    const port = Number.parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10);
    return {
      host: url.hostname,
      port,
      label: `${url.protocol}//${url.host}`,
    };
  } catch {
    return null;
  }
}

function checkTcpReachable(host: string, port: number, timeoutMs = 250) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(reachable: boolean) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function createApiBackendGuard(target: string): Plugin {
  const parsed = parseBackendTarget(target);
  let lastCheckedAt = 0;
  let lastReachable = false;
  let pendingCheck: Promise<boolean> | null = null;
  let lastWarnedAt = 0;

  async function isBackendReachable() {
    if (!parsed) {
      return true;
    }

    const now = Date.now();
    if (now - lastCheckedAt < 500) {
      return lastReachable;
    }

    if (!pendingCheck) {
      pendingCheck = checkTcpReachable(parsed.host, parsed.port)
        .then((reachable) => {
          lastCheckedAt = Date.now();
          lastReachable = reachable;
          return reachable;
        })
        .finally(() => {
          pendingCheck = null;
        });
    }

    return pendingCheck;
  }

  function writeUnavailable(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
    const now = Date.now();
    if (now - lastWarnedAt > 5_000) {
      lastWarnedAt = now;
      console.warn(
        `[talkeby:web] Backend unavailable at ${parsed?.label || target}; returning 503 for ${req.url || "/api"}.`,
      );
    }

    if (res.headersSent || res.writableEnded) {
      return;
    }

    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({
      error: {
        code: "backend_unavailable",
        message: `Talkeby backend is not reachable at ${parsed?.label || target}. Start it with "npm run dev" or use "npm run dev:all".`,
      },
    }));
  }

  return {
    name: "talkeby-api-backend-guard",
    configureServer(server) {
      server.middlewares.use((req, res, next: NextFunction) => {
        if (!req.url?.startsWith("/api")) {
          next();
          return;
        }

        isBackendReachable()
          .then((reachable) => {
            if (reachable) {
              next();
              return;
            }
            writeUnavailable(req, res);
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const webPort = webPortOptions(env);
  const backendTarget = resolveBackendTarget(env);
  const host = env.TALKEBY_BIND_HOST || true;
  const allowedHosts = ["nkdev.urimkrasniqi.com", "talkeby.urimkrasniqi.com", ...remoteAllowedHosts(env.TALKEBY_PUBLIC_URL)];
  const proxy = { "/api": { target: backendTarget, changeOrigin: true } };

  return {
  plugins: [
    react(),
    createApiBackendGuard(backendTarget),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.svg", "pwa-512.svg"],
      manifest: {
        name: "Talkeby Mobile",
        short_name: "Talkeby",
        description: "Control your home Codex runner from mobile.",
        theme_color: "#0f172a",
        background_color: "#f8fafc",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          },
          {
            src: "/pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => shouldCacheApi(url),
            handler: "NetworkFirst",
            options: {
              cacheName: "talkeby-api",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host,
    allowedHosts,
    ...webPort,
    proxy,
  },
  preview: { ...webPort, host, allowedHosts, proxy },
  };
});
