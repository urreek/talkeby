# Talkeby

Talkeby is a local-first remote cockpit for AI coding agents.
It runs on one primary machine, keeps Codex-style thread memory on that machine, and lets you continue the same thread from any authenticated device through the web app.

## What It Does

- Single-owner web access with session login and HTTP-only cookies
- Per-thread memory with persisted Talkeby history and Codex resume sessions
- Mobile-friendly PWA for jobs, threads, approvals, timeline, and settings
- Multi-project routing
- `auto` and `interactive` execution modes
- Runtime approval cards for risky actions
- Real-time updates with SSE
- Local SQLite persistence for jobs, events, approvals, and threads
- Provider support for `codex`, `claude`, `gemini`, `groq`, and `openrouter`
- Observability dashboard

## Architecture

- Backend: Fastify + SQLite + Drizzle ORM
- Frontend: Vite + React + TypeScript + TanStack Router/Query
- UI: Tailwind CSS + shadcn/ui
- Realtime: Server-Sent Events (SSE)
- Execution: Local runner registry in [`src/runners/index.mjs`](/Users/urimkrasniqi/Desktop/dev/talkeby/src/runners/index.mjs)

## Thread Memory Model

Each thread owns its own memory.

That memory includes:

- persisted Talkeby job history for the thread
- the persisted Codex session resume id for the thread

Open the same thread URL on another device and you land on the same backend thread memory.
Different devices can browse different threads independently.

In native Codex parity mode, Talkeby does not replay thread history back into prompts.
To preserve whole-thread native Codex memory, use:

- `CODEX_PARITY_MODE=true`
- `CODEX_DISABLE_SESSION_RESUME=false`
- `RUNTIME_POLICY_ENABLED=false`

If a parity-mode thread loses its native Codex session, start a new thread.

## Prerequisites

- Node.js `>=20.19` (Node 22 LTS recommended)
- Codex CLI installed and authenticated on the machine that runs Talkeby
- Aider CLI installed if using Groq/OpenRouter providers

Authenticate Codex once on the host machine:

```bash
codex login
```

## Quickstart

1. Clone the repo.

```bash
git clone <your-repo-url>
cd talkeby
```

2. Bootstrap dependencies and create `.env` if missing.

```bash
npm run setup:auto
```

3. Run guided setup to confirm access key and project paths.

```bash
npm run setup
```

4. Start backend and web app.

```bash
npm run dev:all
```

Or run them separately:

```bash
npm start
npm run web:dev
```

5. Open the web app.

- Local machine: `http://localhost:5173`
- Same-network device: `http://<your-computer-ip>:5173`

If `APP_ACCESS_KEY` is configured, the app shows a login screen first.

## Required Environment

Minimum useful setup:

- `APP_ACCESS_KEY=<long-random-secret>`
- `CODEX_WORKDIR=<absolute-path-to-default-project>`
- `CODEX_PROJECTS_BASE_DIR=<absolute-path-containing-projects>`
- `CODEX_BINARY=codex`

See [`.env.example`](/Users/urimkrasniqi/Desktop/dev/talkeby/.env.example) for the full list.

Important variables:

- `DEFAULT_EXECUTION_MODE=auto|interactive`
- `PROGRESS_UPDATES=true|false`
- `PROGRESS_UPDATE_SECONDS=<seconds>`
- `CODEX_PROJECTS=name=/abs/path,name2=/abs/path2`
- `CODEX_DEFAULT_PROJECT=<name>`
- `CODEX_MODEL=<model>`
- `CODEX_PARITY_MODE=true|false`
- `CODEX_PERSIST_EXTENDED_HISTORY=true|false`
- `CODEX_DISABLE_SESSION_RESUME=true|false`
- `THREAD_DEFAULT_TOKEN_BUDGET=<int>`
- `THREAD_AUTO_TRIM_CONTEXT_DEFAULT=true|false`
- `AI_PROVIDER=codex|claude|gemini|groq|openrouter`
- `AI_MODEL=<provider-model>`
- `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- `PROVIDER_MODEL_DISCOVERY=true|false`
- `RUNTIME_POLICY_ENABLED=true|false`
- `RUNTIME_POLICY_AUTO_APPROVE_ALL=true|false`
- `RUNTIME_POLICY_FILE_CHANGES_REQUIRE_APPROVAL=true|false`

## How To Use It

1. Pick a project in Settings.
2. Create a thread.
3. Run a task inside that thread.
4. Re-open the same thread on another device by URL and continue working.

Thread URLs are the continuity mechanism for cross-device work.

## Runtime Safety

Talkeby supports two execution modes:

- `auto`: queue and run immediately
- `interactive`: require approval before each run

Runtime policy approvals are separate from execution mode. They protect risky operations such as file changes, depending on your policy settings.

When using native Codex parity mode, Talkeby runtime policy interception must be disabled or native Codex thread continuity will be refused.

## Always-On macOS Services

Install backend only:

```bash
npm run launchd:install
```

Install backend and web app:

```bash
npm run launchd:install:all
```

Check service status:

```bash
launchctl print gui/$(id -u)/com.talkeby.worker
launchctl print gui/$(id -u)/com.talkeby.web
```

Tail logs:

```bash
tail -f logs/worker.out.log logs/worker.err.log logs/web.out.log logs/web.err.log
```

Uninstall services:

```bash
npm run launchd:uninstall:all
```

## Security Checklist

- Set `APP_ACCESS_KEY` before exposing the app outside your LAN
- Keep `.env` out of Git
- Prefer `interactive` mode if the machine is shared
- Restrict project paths to trusted local directories
- Keep provider API keys only in environment variables
- Use `npm run secrets:check` before every commit

## Diagnostics

Run the built-in doctor:

```bash
npm run doctor
```

Doctor checks:

- Node version
- provider binaries and API keys
- Codex parity and session-resume state
- writable data and database directories
- backend and web ports
- access key presence
- cloudflared availability and tunnel token state
- macOS launchd service state

Run repository checks:

```bash
npm run check
npm test
npm run web:check
```

## Internet Access

If you want secure remote access from outside your local network, use a tunnel in front of the web app and keep `APP_ACCESS_KEY` enabled.

Start the Cloudflare helper:

```bash
npm run tunnel:cloudflare
```

## Git-First Workflow

Use Git as the only supported sync path between machines.
Do not copy source files manually.

Development machine:

```bash
git add -A
git commit -m "your message"
git push origin <branch>
```

Deployment target:

```bash
git fetch --all --prune
git checkout <branch>
git pull --ff-only
npm ci
npm run web:install
```

Then restart services.

