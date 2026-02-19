# Talkeby

Talk to Codex from your phone.  
Talkeby runs on your home machine, accepts tasks from Telegram and the mobile web app, and executes them with Codex in your local projects.

## What You Get

- Telegram bot control (`do`, `approve`, `deny`, `mode`, `project`, `status`)
- Mobile web app (PWA) for jobs, approvals, timeline, and settings
- `auto` and `interactive` execution modes
- Real-time updates via SSE
- Local-first storage with SQLite
- Multi-project routing

## Tech Stack

- Backend: Fastify + SQLite + Drizzle ORM
- Worker: Codex CLI (`codex exec`)
- Frontend: Vite + React + TypeScript + TanStack Router/Query
- UI: Tailwind CSS + shadcn/ui
- Realtime: Server-Sent Events (SSE)

## Prerequisites

- Node.js `>=20.19` (recommended: Node 22 LTS)
- Codex CLI installed and authenticated on the machine that runs Talkeby
- Telegram account

Authenticate Codex once:

```bash
codex login
```

## Quickstart

1. Clone and install

```bash
git clone <your-repo-url>
cd talkeby
npm install
npm run web:install
```

2. Configure environment

```bash
cp .env.example .env
```

Required values in `.env`:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS` (your Telegram chat id)
- `CODEX_WORKDIR` (default project path)
- `CODEX_BINARY` (absolute path from `which codex`)

Optional useful values:

- `TELEGRAM_DEFAULT_EXECUTION_MODE=auto|interactive`
- `CODEX_PROJECTS=name=/abs/path,name2=/abs/path2`
- `CODEX_DEFAULT_PROJECT=<name>`
- `CODEX_MODEL=<model>`

3. Start backend + Telegram worker

```bash
npm start
```

4. Start mobile web app (second terminal)

```bash
npm run web:dev
```

5. Open UI

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

## Git-First Laptop -> Home PC Workflow

Use Git as the source of truth. Do not manually copy files between machines.

On laptop:

```bash
git add -A
git commit -m "your message"
git push origin <branch>
```

On home PC:

```bash
git fetch --all --prune
git checkout <branch>
git pull --ff-only
npm ci
npm run web:install
```

Then restart services.

## Always-On (macOS launchd)

Install:

```bash
npm run launchd:install
```

Check status:

```bash
launchctl print gui/$(id -u)/com.talkeby.worker
```

Tail logs:

```bash
tail -f logs/worker.out.log logs/worker.err.log
```

Uninstall:

```bash
npm run launchd:uninstall
```

## Security Checklist

- Keep `ALLOW_UNVERIFIED_CHATS=false`
- Restrict `TELEGRAM_ALLOWED_CHAT_IDS` to your own ids
- Keep `.env` out of Git
- Prefer absolute `CODEX_BINARY`
- Use `COMMAND_PIN` if you want an extra guardrail

## Troubleshooting

- Port in use (`EADDRINUSE`): change `PORT` in `.env`
- Telegram `getMe 404 Not Found`: invalid bot token (regenerate in BotFather)
- `vite: command not found`: run `npm run web:install`
- Node version error for Vite: upgrade to Node `20.19+` or `22.12+`

## API Endpoints

- `GET /health`
- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `POST /api/jobs/:id/approve`
- `POST /api/jobs/:id/deny`
- `GET /api/mode`
- `POST /api/mode`
- `GET /api/projects`
- `POST /api/projects/select`
- `GET /api/events` (SSE)

## Docs

- Architecture notes: `docs/architecture.md`
- Product requirements: `PRD.md`
- Engineering rules: `AGENTS.md`
