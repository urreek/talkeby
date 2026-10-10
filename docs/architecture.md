# Talkeby Architecture Notes

## Runtime Topology

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

- Source of truth: SQLite (`jobs`, `chat_settings`, `job_events`).
- `RuntimeState` keeps an in-memory index for fast chat-local lookups and is hydrated from DB on boot.
- Event stream replay is supported via `afterEventId` to handle reconnects.

## Mobile UI Data Flow

- TanStack Query reads/writes API state.
- SSE (`/api/events`) invalidates list queries and appends timeline events.
- Chat identity is stored locally in browser storage and sent with mutating requests.
