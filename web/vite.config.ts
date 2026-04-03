import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

function resolveBackendTarget() {
  const explicitTarget = process.env.TALKEBY_API_ORIGIN?.trim();
  if (explicitTarget) {
    return explicitTarget;
  }

  const rootEnvPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(rootEnvPath)) {
    const raw = fs.readFileSync(rootEnvPath, "utf8");
    const portMatch = raw.match(/^PORT=(\d{2,5})$/m);
    if (portMatch) {
      return `http://127.0.0.1:${portMatch[1]}`;
    }
  }

  return "http://127.0.0.1:3000";
}

const backendTarget = resolveBackendTarget();

function checkPortAvailable(port: number, host = "0.0.0.0") {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function resolveDevPort(startPort: number) {
  const first = Number.isFinite(startPort) ? Math.max(1, startPort) : 5173;
  for (let port = first; port < first + 50; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  return first;
}

export default defineConfig(async () => {
  const requestedPort = Number.parseInt(process.env.TALKEBY_WEB_PORT || "", 10) || 5173;
  const resolvedPort = await resolveDevPort(requestedPort);
  if (resolvedPort !== requestedPort) {
    console.info(`[talkeby:web] Port ${requestedPort} busy, using ${resolvedPort}.`);
  } else {
    console.info(`[talkeby:web] Using port ${resolvedPort}.`);
  }

  return {
  plugins: [
    react(),
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
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
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
    host: true,
    allowedHosts: [
      "nkdev.urimkrasniqi.com",
      "talkeby.urimkrasniqi.com"
    ],
    port: resolvedPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true
      }
    }
  }
  };
});
