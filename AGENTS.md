# Fit-Stack Agent Guide

> Índice + invariantes. El detalle por área vive en `vaults/` (lectura on-demand). Este archivo define **qué** es innegociable; el **cómo** de cada feature lo decide `coder-expert`.

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm test         # Full test suite (shared → api-worker → jobs-worker → panel → console, Vitest)
pnpm test:e2e     # E2E tests (Playwright, launches dev servers automatically)
pnpm seed:e2e     # Demo seed: fills Fit Stack/fit-stack (keeps data, NOT a test)
pnpm format       # Format code (Prettier)

# Database (Drizzle ORM — all run via @workspace/database)
pnpm db:generate  # Generate migrations (local, no approval needed)
pnpm db:migrate   # Run migrations (REQUIRES approval; CI applies on merge)
pnpm db:push      # Push schema (LOCAL ONLY — never on shared branches)
pnpm db:pull      # Pull schema (LOCAL ONLY)
pnpm db:check     # Verify schema consistency
pnpm db:studio    # Open Drizzle Studio

# Individual apps
cd apps/api-worker  && pnpm dev  # Cloudflare Workers API (Active) — port 8788
cd apps/jobs-worker # Cloudflare Queues Worker — port 8787
cd apps/panel       && pnpm dev  # Port 3001 (Gym Admin / Staff)
cd apps/web         && pnpm dev  # Port 3002 (Member Portal)
cd apps/console     && pnpm dev  # Port 3000 (Platform SaaS Admin)
cd apps/api         # [DEPRECATED] Next.js legacy API — port 3003 (⏸ paused, reference only)

# Bridge (Python/Flet — managed separately with uv) ⏸ PAUSED
# cd apps/bridge
# uv sync
# uv run python main.py
```

## Monorepo Structure

- **Apps**: `api-worker` (Hono / Workers — **Active**), `jobs-worker` (Queues — email + PDF receipts), `panel`/`web`/`console` (Next 16, ports 3001/3002/3000), `bridge` (Python/Flet, **⏸ PAUSED**), `api` (Next 16, **DEPRECATED** — 3003, excluded from the workspace).
- **Packages**: `auth`, `ui`, `shared` (DTOs/types/constants/RBAC), `database` (Drizzle + Neon), `eslint-config`, `typescript-config`.
- **Docs** (`vaults/`, Obsidian): `architecture/`, `business/`, `ai/`, `guides/` (+ `how/`), `backlog/`. There is **no `vaults/tasks/`** — planned work lives in Linear. Bridge is Python, managed with `uv`, not part of Turbo.

## Task Tracking (Linear)

**Linear is the single source of truth for planned work.** The old local system (`vaults/tasks/FS-NNNN/`, `pnpm task:new`, `vaults/guides/task-system.md`) was **removed**: no local id space, nothing to keep in sync.

- **No local id space.** Reference work by its Linear id (`RD-89`). Never invent an `FS-NNNN` id, never reintroduce a task folder. **Long reference material goes to a Linear document.** **No task ids in the codebase** — not in comments, not in tests: the id lives in Linear and in the commit message. ⚠️ `FS-0000001` is **not** a task id: it is the SaaS receipt number from `formatConsoleReceiptNumber`. Never "migrate" it.
- **Workspace**: `Rivas Digital` (`6630fb5f-e79c-42de-8867-49da2a325e10`) via the `linear` MCP server, reachable from `execute` as `tools["linear"].<tool>(…)`.
- **One issue, one coherent scope — no fixed relation to PRs.** Split into **sub-issues** only when there are **distinct hallazgos** or it is **too large** (judge by reviewability). The DB change, backend, frontend, tests and docs that make **one behaviour** work end to end belong together.
- **Split rule**: the **parent is the container** (problem, context, state, sub-issue list); each **sub-issue** (`parentId`) is a self-contained spec. Link issues with `blocks` / `blockedBy` / `relatedTo` whenever a real dependency or shared area exists, **within or across parents**; the parent carries no relations. **Never split by architectural layer**, **never create phases**.
- **Lifecycle**: `Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (plus `Canceled`, `Duplicate`). A rejected PR sends the **same** issue back to `In Progress` with a new PR — never a duplicate.
- **Labels**: `Feature`, `Bug`, `Improvement` → branch prefix `feat`/`fix`/`chore` (`refactor` if structural, `docs` if docs-only); no `Backlog` label.
- **Branch** `<type>/RD-<number>-<kebab-brief-summary>` (≤ 60 chars after prefix); **commit** `<type>: RD-<number> <brief-description>` — the **id goes right after the type**, in every commit, never at the end; a sub-issue uses **its own** id. Both derive from the label and id; `coder-expert` proposes them. **Never auto-commit.**
- **Description template** (English): `## Context` · `## Scope` (In/Out) · `## Acceptance criteria` (verifiable checklist) · `## Notes` (optional). The issue defines **what and why**; **how** is decided by `coder-expert`. **No** implementation plan, **no** verification commands, **no** `## Git`.
- **Language**: Linear content is **English**; the chat response is **Spanish**. `/task "<req>"` captures an issue, `/plan "<req|RD-NNN>"` plans one — both delegate to `planner`. **Unowned work** stays in `vaults/backlog/`.

## Delegation

Use the `subagent` tool with the exact agent id:

| id | Use it for |
|---|---|
| `planner` | Capture, plan, read or update anything in Linear. Never write issues yourself. |
| `coder-expert` | Implement or fix code once a Linear issue exists. Pass its id (`RD-NN`). |
| `reviewer` | Read-only review of the working tree against the issue and AGENTS.md. |
| `docs-writer` | Update `AGENTS.md` and `vaults/` after structural changes. |
| `explore` | Read-only exploration of the codebase. |

Flow: requirement → `planner` → user approves the issue → `coder-expert` → `reviewer` → `docs-writer` when structural.

## Project Context (Business Overview)

### 1. Vision

Multi-tenant SaaS for the Gym/Fitness industry (Latin America): multi-currency billing, member retention, automated physical access. Every gym is an `Organization` (isolation via `organizationId`); B2B SaaS (Platform layer + CMS layer).

**Modules**: Members · Plans · Subscriptions (cumulative expiration) · Payments · Platform/SaaS Admin (`console`) · Staff & Trainers · Classes · CMS (DnD pages/blocks) · Routines · Access Control/Bridge (**⏸ paused**) · Reports · Settings. → [`vaults/architecture/modules.md`](vaults/architecture/modules.md).

**Staff & Trainers**: `gym_member` (base) + `coach_profile` (1:1, role `COACH`) + `auth_member` (role) + `coach_assignment`; views `/dashboard/staff` and `/dashboard/trainers` (coaches appear in both). → [`vaults/architecture/staff-trainers.md`](vaults/architecture/staff-trainers.md).

**Bridge**: Python/Flet desktop at the gym entrance, auth via `x-api-key`. **⏸ PAUSED** — its 3 endpoints (`/verify`, `/sync-tasks`, `/mark-synced`) exist **only in legacy `apps/api`**; `api-worker` does **not** mount `/api/access-control`. → [`vaults/architecture/bridge.md`](vaults/architecture/bridge.md).

### 5. Business Rules Summary

1. **Multi-currency** (base USD default, pays in any active local currency via real-time rates). 2) **Atomic Invoicing** (subscription + payment created as one unit). 3) **Strict Isolation** (scoped to `activeOrganizationId`; the panel never uses `|| "global"`). 4–7) **Cumulative Expiration · Grace Period · Immutable financial record · Unique org slug** → [`vaults/business/subscription-rules.md`](vaults/business/subscription-rules.md).

## Project Rules (Technical Standards)

### 1. Monorepo Architecture & Boundaries

Respect `apps/` vs `packages/`: package logic **MUST NEVER** be duplicated in an app; never import between apps (only via `@workspace/shared`). **3 layers**: Route Handler → Service → Repository (repo filters `organizationId`). **Worker DB pattern**: `createDb(c.env.DATABASE_URL)` **per request**; factories `createX(db)`/`createXService(repo)`; no `process.env` in Workers. No `any`. **Shared-repo exception**: only `receipts`/`platform-receipts` live in `packages/database`; everything else stays in `apps/api-worker`.

### 2. UI Design System & Hierarchy

All components from `@workspace/ui`, predefined variants (no ad-hoc Tailwind without notifying the user). Radius: inputs/buttons `rounded-md` · cards `rounded-xl` · modals `rounded-2xl`. Backgrounds `bg-input`/`bg-card`/`bg-surface` + translucent; low-opacity borders; solid only for focus rings. Forms: native `required` (`CountrySelector`/`SimpleSelect` accept it), close with "Fields with _ are required.". `ActiveCurrenciesField` universe = `COUNTRY_INDEX.currencies`. `ResponsiveModal`: sheet <768px / modal desktop.

### 3. Database Integrity & ORM

Drizzle only, from `@workspace/database`; tables **singular**, repos/services **plural**. **Workflow** `generate → review → migrate`: `db:generate` free; `db:migrate` **requires approval** (CI applies on merge); `db:push` **local-prototype only** (forbidden on shared branches); **seeding requires approval**. **No `pgEnum`** — plain `text('col')` (no `.$type<…>()`), values validated only by Zod; run `pnpm db:check` before pushing. **No interactive transactions** (Neon HTTP): atomicity = a **single statement** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) or **explicit compensation** — never wrap writes in a transaction nor assume rollback. **Compensation**: decide **by re-read, never by error type**; unresolved → fail-closed; orphan → **`cancel()` never `delete()`**; a `voided` payment can't be re-validated (`409`).

### 4. Next.js Patterns & Best Practices

Server First (`"use client"` only at leaf nodes; fetch server-side). URL state over `useState`. `params`/`searchParams` are **Promises**. `useRouter` from `next/navigation` (never `window.location`) + `router.refresh()`. Proxy file = **`proxy.ts`** (heavy logic out).

### 5. Security & Authentication Architecture

Better Auth; client **MUST** use `useAuth()` (never `useSession()` directly); server uses `sessionService`/`getSession()`. Name/Logo SSOT = the `organization` table (`authClient.organization.update()`); tenant identity → `PATCH /api/organizations/profile`; the panel **never** calls `/api/platform/*` from a tenant form; `countryCode`/`primaryCurrency` immutable post-creation. **CORS is code-only** (`apps/api-worker/src/lib/cors.ts`). Public routes skip auth: `/healthz`, `/favicon.ico`, `/api/auth/*`, `/api/init`, `/api/public/*`.

### 6. Route Handler Pattern (`apps/api-worker/src/lib/route-handler.ts`)

Centralized middleware — never write auth/error boilerplate manually.

| Middleware | When | Auth / Context |
| --- | --- | --- |
| `requireOrgPermission(module, action)` | Org-scoped CRUD | Session + orgId + permission (`hasPermission`, `can()` fallback); sets `orgId` |
| `requireOrg()` | Org-scoped, no permission | Session + active org; sets `orgId` |
| `requireOrgTimezone()` | Routes by local date | Validates tz (500 if missing); sets `orgTimezone` |
| `requireAuth()` | General authenticated | Session + user |
| `requirePlatformPermission(module, action)` | SaaS `/api/platform/*` | Session + platform permission |
| `requirePlatformAuth()` | Alias of `requirePlatformPermission('organization','create')` | Session + `organization.create` |

Body via `zValidator('json', schema)`. Global `onError` → `{ error, details? }`; an `HTTPException` with `err.res` is returned **as-is** (business codes: `409 SLUG_TAKEN`, `403 FEATURE_NOT_AVAILABLE`); toasts resolve by **code**, never text. Legacy `apps/api/lib/route-handler.ts` deprecated.

### 7. Error Handling & Mutations

No silent errors; every mutation uses `try/catch` + `toast.success`/`toast.error`. Toasts **NEVER** show raw API messages: use `mutationError(scope, err, "<generic>")` + `toast.error`; UX-meaningful exceptions map the **error code** (`err.data?.code`), never text. A requirement becomes a **Linear issue** (what & why); the **user approves it**; **`coder-expert` decides how** — no implementation plan in the issue; chat in **Spanish**.

### 8. HTTP Client (ofetch — NOT native `fetch`)

**Native `fetch` is PROHIBITED**; use **ofetch** — Fit-Stack API always via each app's context-aware client (`apps/{console,panel}/lib/api/client.ts`: baseURL, cookie forwarding on server, `credentials:"include"`, intercepts `ORGANIZATION_NOT_FOUND`); external APIs via `ofetch` directly; `next/headers` only to read context. Env: `NEXT_PUBLIC_API_BASE_URL` + `NEXT_PUBLIC_R2_URL` required; `NEXT_PUBLIC_EXCHANGE_URL` optional.

### 9. Date & Timezone Handling

SSOT `packages/shared/src/date.ts`; **NEVER** manual date arithmetic (`Intl.DateTimeFormat`, `toISOString().slice(0,10)`, etc.). tz ALWAYS from the **session** (`activeOrganization.timezone`), never a client param. **Timezone is REQUIRED** — no `?? 'America/Caracas'` (`requireOrgTimezone()`; services take `timezone` without default; column `notNull`). Aggregation by local day in **SQL** (`AT TIME ZONE`). SaaS billing in **UTC**. → [`vaults/business/TIMEZONE_MANAGEMENT.md`](vaults/business/TIMEZONE_MANAGEMENT.md).

### 10. Explicit Configuration Without Silent Fallbacks

**NEVER** invent silent fallbacks (`|| "USD"`, `|| "latam"`, `|| "openrouter"`); missing config = visible error. Required (no default): `timezone`/`countryCode`/`primaryCurrency`/`currencyFormat`; extensible → KV `gym_setting` (only fallback `[]`). Org creation derives currency; `POST /api/settings` rejects primary/format (400); no zod `.default()` (defaults in `@workspace/shared/defaults.ts`); UI reads currency/format from the org.

### 11. Money Convention (integer cents)

ALL money is **integer cents** (`bigint`, `z.number().int()`, services/tests/seeds); `exchangeRateApplied` is a rate. Display **only** via `formatCents`; inline `/ 100` **PROHIBITED**; convert with `centsToUnits`/`unitsToCents`, round only with `roundCents`.

## Where to read more

| When you touch … | Read (key invariant) |
| --- | --- |
| Receipts / numbering / ANULADO / fiscal gating | [`business/receipts.md`](vaults/business/receipts.md) — never fiscal invoices; validated ⇔ numbered; ANULADO sealed; never delete (void ≠ cancel) |
| SaaS billing / grace / renewal | [`business/platform-billing.md`](vaults/business/platform-billing.md) — status computed in SQL (not stored); `voided` ignored in Console; free-tier gate else `/no-subscription` |
| Feature flags / free tier / AI credits | [`business/features-and-free-tier.md`](vaults/business/features-and-free-tier.md) — new features `defaultEnabled:false`; downgrade = hide; `403 FEATURE_NOT_AVAILABLE`/`FEATURE_LIMIT_REACHED`; `429 AI_QUOTA_EXCEEDED` |
| Roles / permissions / anti-escalation | [`business/rbac.md`](vaults/business/rbac.md) — never trust client checks; all queries filter `organizationId`; no platform-admin bypass in CMS; uploads = two routes, one authority |
| Subscription rules / compensation | [`business/subscription-rules.md`](vaults/business/subscription-rules.md) |
| Timezone deep dive | [`business/TIMEZONE_MANAGEMENT.md`](vaults/business/TIMEZONE_MANAGEMENT.md) |
| API routes / CORS | [`architecture/api-routes.md`](vaults/architecture/api-routes.md) — `/api/subscriptions` has no DELETE; `/api/access-control/*` not mounted |
| Cache keys / TTLs | [`architecture/cache.md`](vaults/architecture/cache.md) — Redis down never blocks; invalidate on-write |
| Emails / PDF / queues / sweep | [`architecture/jobs.md`](vaults/architecture/jobs.md) — never sync email/PDF; api-worker never depends on `pdf-lib` |
| R2 storage | [`architecture/file-storage.md`](vaults/architecture/file-storage.md) — every org key starts `<orgId>/` (server-resolved); public only `cms/` + `platform/branding/` |
| Package exports / DB schema | [`architecture/packages-and-schema.md`](vaults/architecture/packages-and-schema.md) — 33 tables |
| Modules / Staff & Trainers / Bridge | [`architecture/modules.md`](vaults/architecture/modules.md), [`staff-trainers.md`](vaults/architecture/staff-trainers.md), [`bridge.md`](vaults/architecture/bridge.md) |
| Frontend data layer | [`guides/frontend-data-layer.md`](vaults/guides/frontend-data-layer.md) — no raw `fetch`; post-mutation = service → `updateTag` → `router.refresh()`; `updateTag` server-only |
| Testing | [`guides/testing.md`](vaults/guides/testing.md) — unit+integration and E2E are separate layers |
| Technical standards (full detail) | [`architecture/technical-standards.md`](vaults/architecture/technical-standards.md) |
| Infra & deploy | [`architecture/INFRASTRUCTURE.md`](vaults/architecture/INFRASTRUCTURE.md), [`terraform.md`](vaults/architecture/terraform.md) |

## Important Constraints

- **Never auto-commit**; the user owns their git history.
- **Tests**: run `pnpm test` before asking for review. Integration tests hit real HTTP against a Neon branch (`TEST_DATABASE_URL`; skipped without it; never against prod). Touch subscriptions/payments/receipts → run the financial invariant tests first.
- **Requirements → Linear**: issue states **what and why**; user approves; **`coder-expert` decides how**. Commits carry the id (`<type>: RD-<number> <brief>`); chat in **Spanish**.
- **Database changes** require explicit approval; `db:push` forbidden on shared branches.

### When to update AGENTS.md

After structural changes, update `AGENTS.md` **and** the matching `vaults/` doc for: API routes, RBAC, business rules/modules, new app/package, DB workflow, auth/security, CMS blocks, Bridge, Linear workflow/backlog, cache keys, queue/email/PDF flows, RSC patterns, E2E config, skills, or the `vaults/` structure.

## Skills Available

Use the `skill` tool: `postgresql-table-design`, `neon-postgres`, `neon-drizzle`, `drizzle-orm`, `better-auth-best-practices`, `organization-best-practices`, `vercel-react-best-practices`, `next-best-practices`, `terraform-stacks`, `rag-implementation`, `rag-knowledge-doc-writer`, `copywriting`, `hallmark`, `find-skills`, `customize-opencode`. Skills live in `.agents/skills/` (project) and `~/.agents/skills/` (global); discover with `npx skills find <query>`.

## Key Files to Read First

- `packages/database/src/schema.ts` (33 tables) · `packages/shared/src/access-control.ts` (RBAC SSOT)
- `apps/api-worker/src/{index.ts,lib/auth.ts,lib/route-handler.ts,lib/cache.ts,lib/cors.ts,lib/env.ts}` · `apps/jobs-worker/src/index.ts`
- `packages/auth/src/` · `packages/ui/src/components/{modal.tsx,safe-image.tsx,next/image.tsx}`
- `playwright.config.ts` · `e2e/{panel-setup.ts,console-setup.ts}` · `.opencode/agents/` (subagent roster) · `.opencode/commands/{plan.md,task.md}`
- `vaults/architecture/ARCHITECTURE.md` (architecture spec) · `vaults/backlog/README.md` (pending index)

## Infrastructure & Deployment

> Source in `vaults/architecture/ARCHITECTURE.md` §8; infra in `vaults/architecture/terraform.md` (Workers, R2, Queues) managed with Terraform + GitHub Actions. **Never use `wrangler` manually.**


## NOTES:

Any comment, function name, doc, or inline text in the codebase should be in **ENGLISH**.