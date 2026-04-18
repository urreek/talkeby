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
