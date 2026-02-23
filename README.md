# Talkeby

Talk to coding agents from your phone.  
Talkeby runs on your machine, accepts tasks from Telegram and the mobile web app, and executes them in your local projects.

## What You Get

- Telegram bot control (`do`, `approve`, `deny`, `mode`, `project`, `status`)
- Mobile web app (PWA) for jobs, approvals, timeline, and settings
- `auto` and `interactive` execution modes
- Runtime safety policy approvals for risky actions
- Rich runtime approval cards in the web UI
- Real-time updates via SSE
- Local-first storage with SQLite
- Multi-project routing
- Observability dashboard (success rate, duration, queue, approvals)

## Tech Stack

- Backend: Fastify + SQLite + Drizzle ORM
- Worker: Provider runners (`codex`, `claude`, `gemini`, `groq/openrouter via aider`)
- Frontend: Vite + React + TypeScript + TanStack Router/Query
- UI: Tailwind CSS + shadcn/ui
- Realtime: Server-Sent Events (SSE)

## Prerequisites

- Node.js `>=20.19` (recommended: Node 22 LTS)
- Codex CLI installed and authenticated on the machine that runs Talkeby
- Aider CLI installed if using Groq/OpenRouter providers
- Telegram account

Authenticate Codex once:

```bash
codex login
```

## Quickstart

1. Clone

```bash
git clone <your-repo-url>
cd talkeby
```

2. One-command bootstrap (installs root + web deps, creates `.env` if missing)

```bash
npm run setup:auto
```

3. Guided setup (fills required env values interactively)

```bash
npm run setup
```

Required values (guided setup asks for these):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS` (your Telegram chat id)
- `CODEX_WORKDIR` (default project path)
- `CODEX_BINARY` (`codex` is recommended; absolute path is optional)

Optional useful values:

- `TELEGRAM_DEFAULT_EXECUTION_MODE=auto|interactive`
- `AI_PROVIDER=codex|claude|gemini|groq|openrouter`
- `AI_MODEL=<provider-model>`
- `CODEX_PROJECTS=name=/abs/path,name2=/abs/path2`
- `CODEX_DEFAULT_PROJECT=<name>`
- `CODEX_MODEL=<model>`
- `GROQ_API_KEY=<key>`
- `OPENROUTER_API_KEY=<key>`
- `GOOGLE_API_KEY=<key>`
- `ANTHROPIC_API_KEY=<key>`
- `AIDER_BINARY=aider`
- `FREE_MODELS_ONLY=true`
- `PROVIDER_MODEL_DISCOVERY=false` (recommended for same model lists across machines)
- `APP_ACCESS_KEY=<long-random-secret>`
- `OWNER_CHAT_ID=<your-telegram-chat-id>` (optional default chat for web when app key is used)
- `API_RATE_LIMIT_PER_MINUTE=240`
- `CSRF_TTL_SECONDS=43200`
- `RUNTIME_POLICY_ENABLED=true`

4. Start backend + Telegram worker

```bash
npm start
```

5. Start mobile web app (second terminal)

```bash
npm run web:dev
```

Or run both together for development:

```bash
npm run dev:all
```

6. Open UI

- Local machine: `http://localhost:5173`
- Same network phone: `http://<your-computer-ip>:5173`

## Telegram Setup

1. Open `@BotFather`
2. Run `/newbot`
3. Copy token into `TELEGRAM_BOT_TOKEN`
4. Send your bot message `id` to get chat id
5. Put that id into `TELEGRAM_ALLOWED_CHAT_IDS`

If you do not yet know your chat id:

1. Temporarily set `ALLOW_UNVERIFIED_CHATS=true`
2. Start Talkeby and send `id`
3. Save the returned id into `TELEGRAM_ALLOWED_CHAT_IDS`
4. Set `ALLOW_UNVERIFIED_CHATS=false`

## Command Reference

- `do <task>`: create job
- `mode`: show mode
- `mode auto|interactive`: switch mode
- `approve [job_id]`: approve pending job
- `deny [job_id]`: deny pending job
- `status [job_id]`: show status
- `project [name]`: show/switch active project
- `help`: show help
- `id`: show current chat id

Slash versions also work (`/do`, `/mode`, `/approve`, `/deny`, `/status`, `/project`, `/help`, `/id`).

## Git-First Workflow

Use Git as the source of truth. Do not manually copy files between machines.

On your development environment:

```bash
git add -A
git commit -m "your message"
git push origin <branch>
```

On your deployment target:

```bash
git fetch --all --prune
git checkout <branch>
git pull --ff-only
npm ci
```

Then restart services.

## Always-On (macOS launchd)

Install backend only:

```bash
npm run launchd:install
```

Install backend + web app (recommended for phone UI):

```bash
npm run launchd:install:all
```

Check status:

```bash
launchctl print gui/$(id -u)/com.talkeby.worker
launchctl print gui/$(id -u)/com.talkeby.web
```

Tail logs:

```bash
tail -f logs/worker.out.log logs/worker.err.log logs/web.out.log logs/web.err.log
```

Uninstall backend only:

```bash
npm run launchd:uninstall
```

Uninstall backend + web app:

```bash
npm run launchd:uninstall:all
```

## Security Checklist

- Keep `ALLOW_UNVERIFIED_CHATS=false`
- Restrict `TELEGRAM_ALLOWED_CHAT_IDS` to your own ids
- Set `APP_ACCESS_KEY` before exposing the app outside your local network
- Keep `.env` out of Git
- Prefer absolute `CODEX_BINARY`
- Use `COMMAND_PIN` if you want an extra guardrail

## Troubleshooting

- Port in use (`EADDRINUSE`): change `PORT` in `.env`
- Telegram `getMe 404 Not Found`: invalid bot token (regenerate in BotFather)
- `vite: command not found`: run `npm run web:install`
- Node version error for Vite: upgrade to Node `20.19+` or `22.12+`
- `aider: command not found`: install aider and set `AIDER_BINARY` if needed

Run full local diagnostics:

```bash
npm run doctor
```

Run secret scan before committing:

```bash
npm run secrets:check
```

## API Endpoints

- `GET /health`
- `GET /api/health`
- `GET /api/security/access`
- `GET /api/security/csrf`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `GET /api/jobs/:jobId/stream` (SSE)
- `POST /api/jobs/:id/approve`
- `POST /api/jobs/:id/deny`
- `GET /api/mode`
- `POST /api/mode`
- `GET /api/provider`
- `POST /api/provider`
- `GET /api/provider/catalog`
- `GET /api/projects`
- `POST /api/projects/select`
- `GET /api/runtime-approvals`
- `POST /api/runtime-approvals/:id/approve`
- `POST /api/runtime-approvals/:id/deny`
- `GET /api/observability`
- `GET /api/events` (SSE)

## Docs

- Architecture notes: `docs/architecture.md`
- Product requirements: `PRD.md`
- Engineering rules: `AGENTS.md`
