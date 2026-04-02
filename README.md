# Talkeby

Talkeby is a local-first remote cockpit for AI coding agents.
It runs on one primary machine, keeps Codex-style thread memory on that machine, and lets you continue the same thread from any authenticated device through the web app.

## What It Does

- Single-owner web access with session login and HTTP-only cookies
- Per-thread memory with persisted Talkeby history and Codex resume sessions
- Per-thread provider preferences for provider, model, and reasoning effort
- Mobile-friendly PWA for jobs, threads, approvals, timeline, and settings
- Shared host terminal view for remote shell access
- Multi-project routing
- `auto` and `interactive` execution modes
- Runtime approval cards for risky actions
- Real-time updates with SSE
- Local SQLite persistence for jobs, events, approvals, and threads
- Provider support for `codex`, `claude`, `gemini`, `copilot`, `groq`, and `openrouter`
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
- the last selected provider, model, and reasoning effort for the thread
- resume-from-error jobs continue the interrupted task instead of replaying the original request text back into the provider

Open the same thread URL on another device and you land on the same backend thread memory.
Different devices can browse different threads independently.
Talkeby also imports native Codex app threads that belong to configured projects, and exports Talkeby threads with a persisted native Codex session id back into the Codex app registry so they are visible in both clients.
A brand-new Talkeby thread appears in the Codex app after its first native Codex run creates that session id.
Imported Codex threads show their native conversation history in Talkeby as read-only transcript turns until newer Talkeby-run jobs are appended.
Deleting a thread from Talkeby archives it from the active lists instead of permanently deleting the native Codex session.

In native Codex parity mode, Talkeby does not replay thread history back into prompts.
To preserve whole-thread native Codex memory, use:

- `CODEX_PARITY_MODE=true`
- `CODEX_DISABLE_SESSION_RESUME=false`
- `RUNTIME_POLICY_ENABLED=false`

If a parity-mode thread loses its native Codex session, start a new thread.

## Prerequisites

- Node.js `>=20.19` (Node 22 LTS recommended)
- Codex CLI installed and authenticated on the machine that runs Talkeby
- GitHub Copilot CLI installed and authenticated if using the `copilot` provider
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
  If unset, Codex defaults to `gpt-5.4`.
- `CODEX_PARITY_MODE=true|false`
- `CODEX_PERSIST_EXTENDED_HISTORY=true|false`
- `CODEX_SANDBOX_MODE=read-only|workspace-write|danger-full-access`
- `CODEX_DISABLE_SESSION_RESUME=true|false`
- `THREAD_DEFAULT_TOKEN_BUDGET=<int>`
- `THREAD_AUTO_TRIM_CONTEXT_DEFAULT=true|false`
- `AI_PROVIDER=codex|claude|gemini|copilot|groq|openrouter`
- `AI_MODEL=<provider-model>`
  If unset, Talkeby uses the selected provider default model.
- `CLAUDE_BINARY`, `GEMINI_BINARY`, `COPILOT_BINARY`, `AIDER_BINARY`
- `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- `PROVIDER_MODEL_DISCOVERY=true|false`
- `RUNTIME_POLICY_ENABLED=true|false`
- `RUNTIME_POLICY_AUTO_APPROVE_ALL=true|false`
- `RUNTIME_POLICY_FILE_CHANGES_REQUIRE_APPROVAL=true|false`
- `TALKEBY_TERMINAL_BINARY=<optional shell override for /terminal>`

When `AI_PROVIDER=copilot`, model discovery uses the local Copilot CLI on the host machine. Talkeby tries, in order:

- the authenticated `copilot -p "/model"` response
- local Copilot session/log cache
- Copilot CLI `help config` model info

## How To Use It

1. Pick a project in Settings.
2. Create a thread.
3. Run a task inside that thread.
4. Re-open the same thread on another device by URL and continue working.
5. Open `/terminal` when you need direct shell access on the host machine.

Thread URLs are the continuity mechanism for cross-device work.

## Runtime Safety

Talkeby supports two execution modes:

- `auto`: queue and run immediately
- `interactive`: require approval before each run

Runtime policy approvals are separate from execution mode. They protect risky operations such as file changes, depending on your policy settings.

Codex sandboxing is configured separately with `CODEX_SANDBOX_MODE`:

- `read-only`: inspect files only
- `workspace-write`: allow writes inside the configured workspace
- `danger-full-access`: broad machine access; use only on trusted machines and preferably with `interactive` mode

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

