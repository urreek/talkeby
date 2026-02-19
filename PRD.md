# PRD: Talkeby Mobile Copilot

## Document Control
- Version: 1.0
- Status: Draft for implementation
- Owner: Talkeby maintainers
- Last Updated: 2026-02-19

## Product Summary
Talkeby lets developers control a home-machine Codex runner from mobile, with an interactive approval workflow, live job progress, and secure local-first operation.

## Problem Statement
Developers want to code while away from their computer (travel, outdoors, commuting) without sacrificing safety or visibility. Current chatbot-only flows are usable but limited for approvals, status tracking, and job management.

## Goals
1. Provide a mobile-first UI for creating, approving, and monitoring coding jobs.
2. Support two execution modes per user: `auto` and `interactive`.
3. Stream live job progress and status updates with low latency.
4. Keep sensitive data local-first by default.
5. Make setup easy for other developers on their own home machine.

## Non-Goals
1. Multi-tenant SaaS in v1.
2. Native iOS/Android apps in v1.
3. Full cloud execution of Codex jobs in v1.
4. Team collaboration features in v1.

## Primary Users
1. Solo developer who wants mobile control over a home workstation.
2. Privacy-conscious developer who wants local-first execution and data storage.
3. Power user managing multiple local projects from one mobile interface.

## User Stories
1. As a developer, I can submit a coding task from my phone and see it run.
2. As a developer, I can set mode to `interactive` so no job runs without approval.
3. As a developer, I can approve/deny pending jobs from a simple UI.
4. As a developer, I can switch active project and run tasks in that project.
5. As a developer, I can follow a live timeline to understand what the agent is doing.
6. As a developer, I can install and run the system quickly on a new machine.

## Functional Requirements
1. Job creation:
- Create job from mobile UI and optional Telegram channel.
- Include task text, selected project, mode, metadata.
2. Execution modes:
- `auto`: queue and execute immediately.
- `interactive`: create `pending_approval` job; execute only after explicit approval.
3. Approval actions:
- Approve by job ID.
- Deny by job ID.
- Approve/Deny latest pending job for the user.
4. Job lifecycle:
- Supported states: `pending_approval`, `queued`, `running`, `completed`, `failed`, `denied`.
- Persist all state transitions with timestamps.
5. Live updates:
- Stream updates to UI using SSE.
- Include queue position, started, periodic progress, completed/failed events.
6. Project routing:
- Support one or many project directories.
- Allow project selection per user/session.
7. Codex execution:
- Use `codex exec` non-interactive for task execution.
- Pass configured model when provided.
8. Status and history:
- Show latest job and filter by status.
- Show status for specific job ID.
9. Security:
- Restrict API access with authenticated sessions.
- Restrict Telegram chats by allowlist.
- Optional command PIN for Telegram commands.
10. Setup:
- Simple install/start instructions.
- Background service support (`launchd` first).

## Non-Functional Requirements
1. Performance:
- P95 API response for non-execution endpoints under 300ms on local network.
- UI receives live status update within 2 seconds of backend event emission.
2. Reliability:
- Jobs survive process restart (persistent storage).
- No duplicate execution of approved jobs.
3. Security:
- No secrets in logs.
- Token/session handling follows secure defaults.
4. Maintainability:
- Modular code boundaries and typed contracts.
- Small, focused components and services.

## Technical Stack (Implementation Target)
1. Backend:
- Node.js (latest stable LTS in CI and docs)
- Fastify
- SQLite + Drizzle ORM
- SSE for real-time updates
2. Frontend:
- Vite + React + TypeScript
- TanStack Router + TanStack Query (without TanStack starter template)
- Tailwind CSS
- shadcn/ui component library
- `vite-plugin-pwa` + Workbox
3. Worker:
- Local Codex runner process using `codex exec`
4. Optional channel:
- Telegram bot integration retained as fallback/control channel
5. Source control and distribution:
- Git repository as the single source of truth
- Remote Git host for sync between developer laptop and home PC

## Data Model (v1)
1. `users`
- `id`, `created_at`, `updated_at`
2. `projects`
- `id`, `name`, `path`, `is_default`, `created_at`, `updated_at`
3. `settings`
- `id`, `user_id`, `execution_mode`, `progress_updates_enabled`, `progress_interval_seconds`
4. `jobs`
- `id`, `user_id`, `project_id`, `task`, `status`, `queue_position`, `created_at`, `queued_at`, `pending_approval_at`, `approved_at`, `started_at`, `completed_at`, `failed_at`, `denied_at`
5. `job_events`
- `id`, `job_id`, `event_type`, `message`, `payload_json`, `created_at`

## API Requirements (v1)
1. `GET /api/health`
2. `GET /api/jobs`
3. `GET /api/jobs/:id`
4. `POST /api/jobs`
5. `POST /api/jobs/:id/approve`
6. `POST /api/jobs/:id/deny`
7. `GET /api/mode`
8. `POST /api/mode`
9. `GET /api/projects`
10. `POST /api/projects/select`
11. `GET /api/events` (SSE)

## Mobile UI Requirements (v1)
1. Jobs screen:
- New task composer
- Latest status card
- Pending approvals list
2. Timeline screen:
- Live event stream for selected job
3. Settings screen:
- Mode selector (`auto`/`interactive`)
- Progress interval settings
- Active project selector
4. PWA:
- Installable on iOS/Android home screen
- App icon + manifest + service worker caching
5. UI component policy:
- Use shadcn/ui components as the default base components.
- Style and layout with Tailwind utility classes.
- Do not modify generated shadcn component source files directly; extend via wrappers/composition.

## Setup & Distribution Requirements
1. Quickstart in under 10 minutes for a new developer.
2. One-command local start script.
3. Background-run instructions for macOS (`launchd`) and Linux (`systemd`) documented.
4. Environment validation command (`doctor`) for common failures.
5. Git-first deployment flow documented and supported.
- Develop on laptop, commit, and push to remote.
- Pull the same branch or tag on home PC before restart.
- Do not rely on manual file copy between machines.
6. Branch and release guidance documented for contributors.
- Feature branches for active work.
- `main` (or designated release branch) as stable deployment target.

## Git Workflow Requirements
1. Canonical workflow:
- Work is authored on development machine, committed, and pushed to remote Git.
- Home PC deployment is done via `git pull` of an explicit branch or tag.
2. Reproducibility:
- Dependency lockfiles must be committed.
- Runtime secrets and local DB/state files must not be committed.
3. Release safety:
- Deployment should target reviewed commits only.
- Rollback path is `git checkout <previous-tag-or-commit>` plus service restart.

## Success Metrics
1. Time-to-first-successful-job < 10 minutes for a new setup.
2. >95% of approved jobs start within 5 seconds of approval.
3. >90% of users can complete approve/deny flow without docs after first use.
4. Zero plaintext secret leakage in logs during acceptance tests.

## Milestones
1. M1: Persistent backend foundation (Fastify + DB + job states + SSE).
2. M2: Mobile PWA with create/approve/deny/status.
3. M3: Telegram parity with same mode/approval semantics.
4. M4: Installer + doctor + production-hardening pass.

## Risks & Mitigations
1. Risk: Job duplication after restart.
- Mitigation: explicit lease/lock fields and idempotent transitions.
2. Risk: Sensitive content exposure in logs/events.
- Mitigation: redact rules and configurable retention.
3. Risk: Overly large modules reducing maintainability.
- Mitigation: strict modularity and file size limits in AGENTS rules.

## Acceptance Criteria
1. User can set `interactive` mode and see jobs remain pending until approved.
2. Approved jobs execute and stream progress updates to mobile UI.
3. Denied jobs never execute.
4. Project switching works and reflects in execution path.
5. Setup doc produces a working local install on a clean machine.
