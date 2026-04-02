# AGENTS.md

## Mission

Build and maintain Talkeby as a secure, local-first, mobile-control coding system that feels professional, predictable, and fast.

## Required Engineering Standards

1. Code like a senior software engineer at all times.
2. Prefer latest stable versions of dependencies and tooling when adding or upgrading packages.
3. Keep code clean, explicit, and maintainable.
4. Apply DRY principles without creating harmful abstraction.
5. Modularize large logic into focused files and services.
6. Split large UI components into smaller, composable components.

## Stack Decisions

1. Frontend:

- Vite + React + TypeScript
- TanStack Router + TanStack Query
- Tailwind CSS
- shadcn/ui
- `vite-plugin-pwa` + Workbox

2. Backend:

- Fastify
- SQLite + Drizzle ORM
- SSE for live event streaming

3. Worker:

- Local AI execution via pluggable runner registry (`src/runners/index.mjs`)
- Supported providers: Codex (`codex exec`), Claude Code (`claude -p`), Gemini (`gemini`)
- Extended providers: Groq and OpenRouter via Aider bridge (`aider --model groq/...|openrouter/...`)
- Each runner implements: `async function run({ task, workdir, model, timeoutMs, binary }) → { message }`

## Architecture Rules

1. Keep transport, domain, and persistence layers separated.
2. Keep execution orchestration isolated from HTTP route handlers.
3. Business rules must live in service modules, not controller handlers.
4. Shared types and schemas must be centralized and reused.
5. Avoid circular dependencies between modules.
6. All AI provider integrations must implement the runner interface (`{ task, workdir, model, timeoutMs, binary } → { message }`).
7. Provider selection is resolved at job execution time via `state.getProvider()`.

## Modularity & Size Rules

1. Any file approaching 300 lines should be evaluated for splitting.
2. Any function over 50 lines should be reviewed for decomposition.
3. Any React component over 150 lines should be split unless strongly justified.
4. Keep one clear responsibility per module.

## API & Validation Rules

1. Validate every external input at boundaries.
2. Use typed request/response schemas for all endpoints.
3. Return deterministic error shapes.
4. Never trust client-side validation alone.

## Data & Persistence Rules

1. Persist all job state transitions.
2. Use migrations for all schema changes.
3. Do not mutate state outside explicit service methods.
4. Keep retention and cleanup logic explicit and configurable.

## Realtime Rules

1. Emit structured job events (`type`, `message`, `timestamp`, `jobId`).
2. Ensure event order is deterministic per job.
3. Handle reconnect/resume behavior for SSE clients.
4. Do not rely on in-memory state as the only source of truth.

## Security Rules

1. Never commit secrets or tokens.
2. Keep sensitive values in environment variables.
3. Redact sensitive task/output data from logs by default.
4. Enforce allowlists and auth checks before job actions.
5. Default to least privilege and safe mode (`interactive` preferred in shared setups).
6. Provider API keys (ANTHROPIC_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY) must be env vars only — never persisted, logged, or exposed to the frontend.

## Error Handling Rules

1. Fail with actionable error messages.
2. Wrap external API and process execution failures with context.
3. Do not swallow errors silently.
4. Include correlation IDs for multi-step job flows.

## Testing Rules

1. Add unit tests for core services and state transitions.
2. Add integration tests for job lifecycle APIs.
3. Add regression tests for approval flow (`pending_approval -> approved|denied`).
4. Add tests for security-critical boundaries.

## Performance Rules

1. Avoid blocking operations in request handlers.
2. Stream updates incrementally rather than polling large payloads.
3. Keep mobile payloads compact.
4. Optimize only after measuring bottlenecks.

## Frontend UX Rules

1. Mobile-first layouts are required.
2. Show clear status transitions (`pending`, `queued`, `running`, `completed`, `failed`, `denied`).
3. Prefer explicit controls over hidden gestures for critical actions.
4. Approval/deny actions must be obvious and reversible where feasible.
5. Surface system health and last update timestamps in UI.

## UI Component Rules

1. Use Tailwind CSS for styling and layout primitives.
2. Use shadcn/ui as the default component foundation.
3. Never edit generated shadcn component source files directly.
4. Customize behavior/appearance via wrappers, composition, variants, or local feature components.
5. If a shadcn component must change globally, regenerate or override externally instead of patching vendor component source.

## Documentation Rules

1. Update README when setup or runtime behavior changes.
2. Keep PRD aligned with implemented scope and decisions.
3. Add concise architecture notes for non-trivial patterns.
4. Document all environment variables and defaults.

## Git & Review Rules

1. Keep commits focused and atomic.
2. Do not mix refactors with unrelated feature changes.
3. Include risk assessment in PR descriptions.
4. Require green tests and lint before merge.
5. Use Git as the only supported sync and deployment path between machines.

- Develop -> commit -> push -> pull on deployment target.
- Do not manually copy source files between machines.

6. Never edit deployed target code without committing and pushing from source branch first.
7. Prefer deploying reviewed commits from `main` (or an agreed release branch/tag).
8. Commit lockfiles when dependencies change to keep environments reproducible.
9. Never commit `.env`, local database files, logs, or other machine-specific runtime artifacts.
10. For every completed task, commit and push the changes by default unless the user explicitly says not to.
11. Run `npm run secrets:check` before every commit and fix any findings before pushing.

## Deployment Workflow (Git-First)

1. Development machine workflow:

- Create/update branch.
- Implement changes with tests and docs.
- Commit small, readable units.
- Push branch to remote.

2. Deployment target workflow:

- `git fetch --all --prune`
- `git checkout <deploy-branch-or-tag>`
- `git pull --ff-only`
- `npm ci && npm run web:install`
- Restart worker/web services.

3. Rollback workflow:

- `git checkout <previous-stable-tag-or-commit>`
- Reinstall dependencies only if lockfile changed.
- Restart services and verify health.

## Definition of Done

1. Implementation matches PRD requirements for the targeted milestone.
2. Tests pass locally for modified areas.
3. Docs are updated.
4. Security checks for changed surfaces are completed.
5. Code is modular, readable, and production-ready.
