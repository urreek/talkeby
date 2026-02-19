# Talkeby: Telegram + Mobile UI -> Codex (Home Always-On)

Send a Telegram message from your phone (or keyboard dictation), and this worker runs `codex exec` on your home machine.  
When Codex finishes, the bot replies in the same chat.

The bot now posts live status transitions:

- queued
- started
- periodic still-running updates
- completed or failed

There is also a mobile web app (`web/`) with:

- create job
- approve/deny pending jobs
- set mode/project
- live timeline via SSE

## 1) Prerequisites

- Node.js `>=20.19` (or `>=22.12`)
- Codex CLI installed and authenticated
- Telegram account

Run once on your computer:

```bash
codex login
```

## 2) Create Your Telegram Bot

1. Open Telegram and chat with `@BotFather`.
2. Run `/newbot`.
3. Pick a bot name and username.
4. Copy the bot token (looks like `123456789:ABC...`).
5. Optional: run `/setcommands` and paste:

```text
do - Run a coding task
mode - Show or switch execution mode
approve - Approve a pending interactive job
deny - Deny a pending interactive job
status - Show latest job status
project - Show or switch active project
id - Show current chat id
help - Show command help
```

## 3) Configure Local `.env`

From this project directory:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `TELEGRAM_BOT_TOKEN` = token from BotFather
- `CODEX_WORKDIR` = default repo path Codex should work in
- `CODEX_BINARY` = absolute path from `which codex` (recommended)
- `DATA_DIR` + `DATABASE_FILE` = local persistence location for jobs/events/settings
- `TELEGRAM_DEFAULT_EXECUTION_MODE` = `auto` or `interactive`
- Optional progress tuning:
  - `TELEGRAM_PROGRESS_UPDATES=true|false`
  - `TELEGRAM_PROGRESS_UPDATE_SECONDS=60`

Optional multi-project setup:

- `CODEX_PROJECTS` = comma-separated `name=/absolute/path` entries
  - Example: `CODEX_PROJECTS=web=/Users/me/dev/web,api=/Users/me/dev/api`
- `CODEX_DEFAULT_PROJECT` = one project name from `CODEX_PROJECTS`

Example helper command:

```bash
which codex
```

Install dependencies:

```bash
npm install
npm --prefix web install
```

## 4) Get Your Chat ID

1. In `.env`, temporarily set:
   - `ALLOW_UNVERIFIED_CHATS=true`
2. Start the worker:

```bash
npm start
```

3. Message your bot from your phone: `id`
4. Bot replies with `Chat ID: <number>`
5. Stop the worker (`Ctrl+C`)
6. Put that number in `.env`:
   - `TELEGRAM_ALLOWED_CHAT_IDS=<number>`
7. Set back:
   - `ALLOW_UNVERIFIED_CHATS=false`

## 5) Run And Test

Start worker again:

```bash
npm start
```

From your phone, send:

```text
do create a TODO app in the current repo
```

You can also use:

- `mode`
- `mode auto`
- `mode interactive`
- `approve` (latest pending job)
- `approve <job_id>`
- `deny` (latest pending job)
- `deny <job_id>`
- `status`
- `status <job_id>`
- `project`
- `project <name>`
- `help`
- `/do ...`, `/mode ...`, `/approve ...`, `/deny ...`, `/status`, `/project`, `/id`, `/help`

Plain text without `do` is treated as a coding task.

If `COMMAND_PIN` is set, prefix commands, for example:

```text
2468 do add tests for auth service
```

## 6) Run Mobile PWA UI

Start backend and Telegram worker:

```bash
npm start
```

In another terminal, start mobile web app:

```bash
npm run web:dev
```

Open from your phone on the same network:

```text
http://<your-computer-ip>:5173
```

In the UI, set your Telegram chat ID once (Settings or first screen).  
The UI then controls the same chat-scoped mode/project/jobs as Telegram.

## 7) Make It Always-On (launchd)

Install the launch agent:

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

Uninstall later:

```bash
npm run launchd:uninstall
```

## Security Notes

- Keep `ALLOW_UNVERIFIED_CHATS=false`
- Keep `TELEGRAM_ALLOWED_CHAT_IDS` set to only your own chat IDs
- Use `COMMAND_PIN` if you want an extra guardrail
- Prefer absolute `CODEX_BINARY` in `.env` so `launchd` can always find Codex

## Local Debug Endpoints

Most `/api/*` endpoints require `chatId` and enforce `TELEGRAM_ALLOWED_CHAT_IDS`.

- `GET /health`
- `GET /jobs`
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
- `GET /api/events` (SSE stream)

Architecture notes: `docs/architecture.md`
