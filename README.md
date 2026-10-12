# Talkeby

Talkeby is a local-first remote cockpit for AI coding agents.
It runs on one primary machine, keeps Codex-style thread memory on that machine, and lets you continue the same thread from any authenticated device through the web app.

## What It Does

- Single-owner web access with session login and HTTP-only cookies
- Per-thread memory with persisted Talkeby history and Codex resume sessions
- Per-thread provider preferences for provider, model, and reasoning effort
- New chats are selected immediately and listed newest-created first on desktop and mobile, regardless of older chats' job status or activity
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

Codex imports are atomic and repeatable. If a native session ID is already used as a Talkeby thread ID whose session has changed, the importer assigns the native conversation a separate ID. Existing messages, titles, settings, and archived records are preserved; a database reset is not needed.

That memory includes:

- persisted Talkeby job history for the thread
- the persisted Codex session resume id for the thread
- the last selected provider, model, and reasoning effort for the thread
- resume-from-error jobs continue the interrupted task instead of replaying the original request text back into the provider

Open the same thread URL on another device and you land on the same backend thread memory.
Different devices can browse different threads independently.
Talkeby also imports native Codex app threads that belong to configured projects, and exports Talkeby threads with a persisted native Codex session id back into the Codex app registry so they are visible in both clients.

Runtime services accept legacy Codex project configuration during migration; explicit workspace configuration takes precedence. Copilot model discovery reads structured JSONL payloads and skips provider-prefixed model identifiers that its CLI cannot use.
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

- Git and Node.js `>=20.19` with npm (development is tested with Node 24)
- A Codex account; setup installs the CLI if needed and guides sign-in
- GitHub Copilot CLI installed and authenticated if using the `copilot` provider
- Aider CLI installed if using Groq/OpenRouter providers

## Quickstart

Clone the repo, then run one command:

```bash
git clone https://github.com/urreek/talkeby.git
cd talkeby
npm run quickstart
```

Setup installs backend and frontend dependencies from their lockfiles, creates `.env` with local paths and a unique login key, installs Codex if absent, checks sign-in and SQLite, then starts both servers. It works in Windows PowerShell, macOS, and Linux. Follow Codex's sign-in prompt when needed.

Open `http://localhost:5173` and log in with `APP_ACCESS_KEY` from your local `.env`. Setup never prints that key. The initial project is the Talkeby folder; add other folders in Settings. New installs use `interactive` execution, native Codex continuity, and the configured sandbox. Existing settings and login keys are preserved; incompatible existing settings receive an actionable error.

On later runs, start directly without reinstalling:

```bash
npm run dev:all
```

For setup without starting, use `npm run setup` (`setup:auto` is an alias). Run `npm run setup:guided` for manual workspace/key configuration, or `npm run doctor` for diagnostics. A noninteractive terminal with no Codex authentication receives instructions to run `codex login`; it does not wait for browser sign-in.

Or run the servers separately:

```bash
npm start
npm run web:dev
```

Access addresses:

- Local machine: `http://localhost:5173`
- The web server always uses the same configured port on restart: `TALKEBY_WEB_PORT`, then `WEB_PORT`, then `5173`. Set it in the root `.env` or process environment. Dev and preview fail if that port is occupied instead of switching to another port; stop the previous instance before restarting. The backend uses `PORT` (default `3000`).
- Same-network device: `http://<your-computer-ip>:5173`

For a network-accessible frontend, run `npm run web:dev -- --host 0.0.0.0` or `npm run dev:all`. Both `web:dev` and `dev:web` forward CLI options to Vite; include `--host` before the address. The Vite allowlist includes `talkeby.urimkrasniqi.com` and `nkdev.urimkrasniqi.com`.

If `APP_ACCESS_KEY` is configured, the app shows a login screen first.

## Required Environment

Minimum useful setup:

- `APP_ACCESS_KEY=<long-random-secret>`
- `WORKSPACE_DIR=<path-to-your-local-workspace-root>`
- `CODEX_BINARY=codex`

See [`.env.example`](/Users/urimkrasniqi/Desktop/dev/talkeby/.env.example) for the full list.

Setup defaults: `DATA_DIR=./data`, `DATABASE_FILE=./data/talkeby.db`, `WORKSPACE_DIR=.`, `PORT=3000`, `WEB_PORT=5173`, `DEFAULT_EXECUTION_MODE=interactive`, and `RUNTIME_POLICY_ENABLED=false` for native Codex continuity. The generated access key remains in your ignored `.env`; each developer uses their own configuration and provider authentication.

Important variables:

- `DEFAULT_EXECUTION_MODE=auto|interactive`
- `PROGRESS_UPDATES=true|false`
- `PROGRESS_UPDATE_SECONDS=<seconds>`
- `WORKSPACE_DIR=<path-to-your-local-workspace-root>`
- `PROJECTS=name=/abs/path,name2=/abs/path2`
- `DEFAULT_PROJECT=<name>`
- `CODEX_MODEL=<model>`
  If unset, Codex defaults to `gpt-6.1-sol`.
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

`WORKSPACE_DIR` is machine-local. If you copy the same `.env` to another PC, update it there too unless the same path exists on that machine. If the configured path is missing, Talkeby falls back to its own repo directory. Relative paths are supported and resolve from the Talkeby backend working directory.

OpenAI Codex and Claude Code model pickers combine live discovery with a current fallback catalog. As of October 3, 2026, the fallback includes OpenAI `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol`, plus Claude `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`, and `claude-haiku-4-5`. Model IDs are verified against the [OpenAI Codex model documentation](https://learn.chatgpt.com/docs/models) and [Claude model overview](https://platform.claude.com/docs/en/models/overview). Account access and installed CLI versions determine which models can run. Claude Sonnet 5.5 requires Claude Code v2.1.284 or later; Opus 5.5 requires v2.1.280 or later. Upgrade with `claude update` ([Claude Code model configuration](https://code.claude.com/docs/en/model-config)). Claude's Provider default continues to use the CLI/account default. Explicit environment and saved thread model selections remain unchanged.

Reasoning effort remains selectable for current OpenAI and supported Claude models even when live discovery is unavailable. Fallback levels are `low`, `medium`, `high`, `xhigh`, and `max`; GPT-6 Luna also supports `none`. Talkeby defaults to `medium` when supported, preserving explicit chat selections. Discovered levels take precedence; the model default is used when `medium` is unavailable. Claude Haiku does not support an effort setting, so its control stays unavailable and Talkeby omits the CLI effort flag. See [OpenAI model guidance](https://learn.chatgpt.com/docs/models) and [Claude Code effort levels](https://code.claude.com/docs/en/model-config#adjust-effort-level).

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

Codex tasks can include up to three PNG, JPEG, or WebP attachments (5 MB each, 10 MB total). Attachments remain available in chat history after approval, denial, retry, or restart. Retrying a generated continuation recovers its original user task; a missing source returns an actionable error.

Assistant replies can display local PNG, JPEG, WebP, or GIF images through Markdown links or images, including imported Codex history. Only referenced files inside the configured project workspace are served, up to 5 MB, behind the normal owner authentication. Image responses are excluded from PWA caching. Temporary upload files are removed after execution; a cleanup failure records a `job_cleanup_failed` event and releases worker resources.
“Resume from error” continues the saved native session when available. If the failed run created no session, Talkeby recovers the original user task (including through repeated resume attempts) before launching it again. The source job link is persisted before the new job is queued or awaits approval.
If Codex rejects a resumed session because it already has an active writer in another client, Talkeby continues through `codex exec fork` using the saved native history and persists the new session id for later messages. Live output reports this branch. The original Codex conversation remains separate; later messages in either client do not sync into the other branch. This recovery requires a Codex CLI supporting `exec fork`; other resume errors are returned without starting a fresh session.

The workspace sidebar and mobile drawer show subscription usage for the selected provider. For Codex signed in with a ChatGPT subscription on the host, Talkeby reads `account/rateLimits/read` from the local Codex app-server and shows remaining percentages per quota window, reset times, and the last check time. It refreshes every 30 seconds and supports manual refresh (throttled to five seconds). These are account-wide subscription limits, separate from each thread's token budget. Missing limits and API-key-only sign-in show an unavailable message rather than an estimated allowance. For Claude, use the **Open Claude usage** link or `/usage` in Claude Code; Talkeby does not use an undocumented subscription API. Other providers show an unsupported message. No new environment variables are needed.

Use the trash button beside a project in the left workspace panel (or mobile workspace drawer) to delete it from Talkeby after confirmation. Project files and thread/job history are retained; add the project again from Settings to access its history. Deleting the active project selects a remaining project, or shows the empty workspace when none remain.

## Runtime Safety

Talkeby supports two execution modes:

- `auto`: queue and run immediately
- `interactive`: require approval before each run

Runtime policy approvals are separate from execution mode. They protect risky operations such as file changes, depending on your policy settings.

Codex sandboxing is configured separately with `CODEX_SANDBOX_MODE`:

Fresh and resumed Codex CLI runs pass explicit `approval_policy=on-request` and `sandbox_mode` configuration, defaulting to `workspace-write`. This supports current Codex releases that removed `--full-auto`. If Codex reports `failed to load models cache: unknown variant 'max'`, update the standalone CLI with `npm install -g @openai/codex@latest` and restart Talkeby; an older CLI may be reading the newer desktop app's shared model cache.

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
- selected remote provider, HTTPS configuration, and connector availability
- macOS launchd service state

Doctor reads quoted `.env` values with Node's dotenv parser and honors process environment overrides, including `TALKEBY_WEB_PORT`. It validates the selected remote configuration without printing credentials. A successful local check does not verify Cloudflare routing/Access policies or Tailscale device access; complete remote setup and test the printed URL from your phone.

Run repository checks:

```bash
npm run check
npm test
npm run web:check
```

## Internet Access

Choose either provider in the guided setup, then start with one command:

```bash
npm run remote:setup
npm run remote:start
```

Setup includes normal application onboarding, offers to install the selected connector with winget on Windows, and saves your choice and HTTPS address in the ignored `.env`. Later starts reuse that configuration. To choose directly or switch providers, use `npm run remote:setup -- tailscale` or `npm run remote:setup -- cloudflare`. Stop a running instance before switching.

- **Tailscale:** sign in on the host and phone using the same tailnet. Setup discovers the machine's stable `.ts.net` address and checks for existing Serve services. On first start, follow Tailscale's HTTPS enablement link if shown. Access stays private to your tailnet; Talkeby uses Serve. The default HTTPS port is 443; setup allows another port when 443 already serves another app.
- **Cloudflare:** create a named tunnel, route your hostname to `HTTP http://127.0.0.1:5173` (or the web port printed by setup), and protect the hostname with a Cloudflare Access application and an Allow policy for your email. Setup walks through these account steps, asks for the hostname, and accepts a hidden token. Enter only the token from Cloudflare's installation command. A Cloudflare-managed domain is required. [Cloudflare's account setup guide](https://developers.cloudflare.com/cloudflare-one/setup/secure-private-apps/private-web-app/) explains the dashboard steps. Temporary Quick Tunnels are unsupported because [they do not support SSE](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

`remote:start` builds the frontend, runs the backend and web preview on loopback with fixed ports, then starts the chosen HTTPS connector. Open the printed URL after the connector reports ready. Log in with `APP_ACCESS_KEY` from your local `.env`; Cloudflare Access is an additional login. Ctrl+C stops the app and connector. A child-process failure stops the other processes too. Existing Tailscale Serve services are never overwritten. If the host's Tailscale address changes, rerun setup; if the Cloudflare web port changes, update the dashboard route as well.

macOS/Linux users install the selected connector from [Tailscale](https://tailscale.com/download) or [Cloudflare](https://developers.cloudflare.com/tunnel/downloads/) if missing; setup prints the appropriate link. No router port forwarding is needed. HTTPS also enables phone microphone access. Local `npm run dev:all` still works independently of the saved remote choice. `npm run tunnel:cloudflare` is a compatibility alias for starting the configured Cloudflare app and tunnel.

Remote variables are documented in `.env.example`: `TALKEBY_REMOTE_PROVIDER` (unset by default), `TALKEBY_PUBLIC_URL` (exact HTTPS origin), `TALKEBY_TAILSCALE_PORT` (443), `CLOUDFLARE_TUNNEL_TOKEN` (required only for Cloudflare), and optional connector binary overrides. `TALKEBY_BIND_HOST` defaults to `0.0.0.0` for ordinary starts; remote start overrides it to `127.0.0.1`. `TALKEBY_API_ORIGIN` normally derives from `PORT`, and remote start overrides it to the local backend. Tunnel tokens stay in `.env`, are passed through environment variables, and are never printed or included in command arguments. Never commit or share `.env`.

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

