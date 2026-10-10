> **Alcance:** app Bridge (Flet/Python) de control de acceso físico — contrato de API y estado PAUSED.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

### 4. The Bridge App (Hardware Integration)

A Python/Flet desktop application running locally at the gym entrance. Communicates with the API to validate a member's QR/Biometric data against their active subscription, turning "billing data" into "physical access."

**API contract** (authenticated via `x-api-key` header → `ACCESS_CONTROL_API_KEY`):

- `POST /api/access-control/verify` — validate `documentId` + `organizationId`, returns access decision, creates audit log
- `GET /api/access-control/sync-tasks` — poll pending biometric enroll/delete tasks
- `POST /api/access-control/mark-synced` — confirm task completion

**Tables**: `access_control_log` (audit trail of every access attempt), `biometric_sync_task` (queue of sync tasks for devices)

> **⏸ Status: PAUSED.** The Bridge and `apps/api` are paused. The 3 endpoints (`/verify`, `/sync-tasks`, `/mark-synced`) and the `access-control.repository.ts` repository exist **only in `apps/api` (legacy)** — the active `apps/api-worker` does **not** mount `/api/access-control` yet. There is no migration in progress. When reactivated, port it to a `createAccessControlRepository(db)` factory + Hono router with `requireApiKey` middleware, and add `ACCESS_CONTROL_API_KEY` to `apps/api-worker/src/lib/env.ts` + Terraform `secret_text_bindings`.
