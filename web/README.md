# Talkeby Mobile PWA

## Stack

- Vite + React + TypeScript
- TanStack Router + TanStack Query
- Tailwind CSS
- shadcn-style UI components in `src/components/ui`
- `vite-plugin-pwa` + Workbox

## Run

```bash
npm install
npm run dev
```

The app expects backend API at `/api/*`.
From the repository root, use `npm run web:dev -- --host 0.0.0.0` (or `npm run dev:all`) to expose the frontend on the network. The root launchers forward flags to Vite. `talkeby.urimkrasniqi.com` and `nkdev.urimkrasniqi.com` are explicitly allowed in `web/vite.config.ts`. Pass the address with `--host`; a bare `0.0.0.0` is interpreted as a project directory and prevents the intended config from loading.
During local development, Vite proxies `/api` to the backend `PORT` from root `../.env`.
If the backend is temporarily unavailable, Vite returns a compact `503` JSON response instead of printing the raw proxy stack.
Optional override:

```bash
TALKEBY_API_ORIGIN=http://127.0.0.1:3003 npm run dev
```

## Build

```bash
npm run build
npm run preview
```
