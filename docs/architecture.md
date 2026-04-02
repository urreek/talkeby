# Talkeby Architecture Notes

## Runtime Topology

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
