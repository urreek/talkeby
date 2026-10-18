# Talkeby Architecture Notes

Output media is validated against job Markdown references and the configured
project before being copied into `talkeby-previews/<SHA-256 job ID>/` with hashed
reference filenames. The worker captures media before publishing completion;
native/older history captures on first access. Writes use private temporary files
and atomic rename, with per-reference serialization. Saved copies retain the job
completion timestamp as mtime, so reads and cleanup share a fixed seven-day expiry
that survives restarts and cannot be extended by viewing. Both media endpoints use
the saved copy; video streaming retains byte-range support. Cleanup only removes
expired managed files, never evicts unexpired captures for capacity, and rejects
redirected storage directories. Save failures emit a redacted job event without
failing otherwise successful code execution.

## Runtime Topology

Remote access is composed by `scripts/remote.mjs` from separate setup, provider, prompt, and supervisor modules. Shared remote configuration validates HTTPS origins and fixed ports; Vite allows only the selected exact hostname alongside legacy hosts and proxies `/api` in both dev and preview. Remote start binds origins to loopback, waits for readiness, then runs foreground Tailscale Serve or a token-authenticated named Cloudflare Tunnel. The supervisor stops owned process trees on cancellation or failure. Existing Serve configurations are checked before launch and never reset. Cloudflare credentials are environment-only in connector arguments; its account hostname/Access policy remain dashboard-managed. Quick Tunnels are excluded because they do not support SSE. Auth, CSRF, and event replay stay in the existing backend services.

Setup runs on built-in Node modules before dependencies exist. `scripts/setup.mjs` composes focused environment, provider, and process modules. Root `npm ci` runs frontend `npm ci` through postinstall; provider installation is separate from locked application dependencies. npm subprocesses use the npm JavaScript entry point when available, avoiding Windows command-shim failures. Existing configuration is preserved, placeholder paths/keys are repaired, and native SQLite is verified by opening an in-memory database. Quickstart launches the existing development supervisor only after setup succeeds.

Subscription usage is read-only and separate from job token accounting. `providers/codex-subscription.mjs` reads ChatGPT quota windows through the local Codex RPC transport, with a bounded timeout and subprocess cleanup. `services/subscription-usage.mjs` normalizes an allowlisted response, deduplicates concurrent reads, and caches for 30 seconds (manual refresh has a five-second throttle). `http/subscription-routes.mjs` validates provider input and returns only compact quota fields behind the existing owner authentication hooks. No credentials or raw provider payloads reach the frontend or persistence. The workspace UI polls only the selected provider and links Claude users to their documented usage dashboard.

- `src/server.mjs`: composition root (config, DB, services, HTTP)
- `src/http/*`: Fastify route registration
- `src/services/*`: domain logic (state, lifecycle, runner, event bus)
- `src/db/*`: SQLite bootstrap + Drizzle repository
- `web/*`: mobile PWA UI

## Job Lifecycle

1. Job is created via `POST /api/jobs`.
2. In `interactive` mode, it is persisted as `pending_approval`.
3. Approval transitions to `queued` and enters serialized `JobRunner` queue.
4. Runner transitions to `running`, executes `codex exec`, then `completed` or `failed`.
5. Every transition emits a persisted `job_events` record and SSE broadcast.

## State Model

Native thread imports use `db/thread-import.mjs` inside an immediate SQLite transaction. The importer rechecks session ownership under the writer lock and checks raw thread IDs, including archived or merged records. An occupied ID receives a new UUID; normal thread creation still rejects duplicates and unrelated database failures propagate. This preserves conversation identity after native session forks and prevents overlapping importers from creating the same row.

- Source of truth: SQLite (`jobs`, `chat_settings`, `job_events`).
- `RuntimeState` keeps an in-memory index for fast chat-local lookups and is hydrated from DB on boot.
- Event stream replay is supported via `afterEventId` to handle reconnects.

## Mobile UI Data Flow

- TanStack Query reads/writes API state.
- SSE (`/api/events`) invalidates list queries and appends timeline events.
- Chat identity is stored locally in browser storage and sent with mutating requests.
