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
During local development, Vite proxies `/api` to `http://127.0.0.1:3000`.
By default, proxy target is auto-detected from root `../.env` `PORT`.
Optional override:

```bash
TALKEBY_API_ORIGIN=http://127.0.0.1:3003 npm run dev
```

## Build

```bash
npm run build
npm run preview
```
