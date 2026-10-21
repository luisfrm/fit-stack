# Fit-Stack Agent Guide

> Índice + invariantes del código y arquitectura. El detalle por área vive en `vaults/` (lectura on-demand).

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm test         # Full test suite (shared → auth → api-worker → jobs-worker → panel → console, Vitest)
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
```

## Monorepo Structure

- **Apps**: `api-worker` (Hono / Workers — **Active**), `jobs-worker` (Queues — email + PDF receipts), `panel`/`web`/`console` (Next 16, ports 3001/3002/3000).
- **Packages**: `auth` (sessions + shared HTTP client + org/platform hooks), `ui`, `shared` (DTOs/types/constants/RBAC), `database` (Drizzle + Neon), `eslint-config`, `typescript-config`.
- **Docs** (`vaults/`, Obsidian): `architecture/`, `business/`, `ai/`, `guides/` (+ `how/`). Backlog/pending work lives in Linear (project «Fit Stack»).

## Project Context (Business Overview)

### 1. Vision

Multi-tenant SaaS for the Gym/Fitness industry (Latin America): multi-currency billing, member retention, automated physical access. Every gym is an `Organization` (isolation via `organizationId`); B2B SaaS (Platform layer + CMS layer).

**Modules**: Members · Plans · Subscriptions (cumulative expiration) · Payments · Platform/SaaS Admin (`console`) · Staff & Trainers · Classes · CMS (DnD pages/blocks) · Routines · Reports · Settings. → [`vaults/architecture/modules.md`](vaults/architecture/modules.md).

**Staff & Trainers**: `gym_member` (base) + `coach_profile` (1:1, role `COACH`) + `auth_member` (role) + `coach_assignment`; views `/dashboard/staff` and `/dashboard/trainers` (coaches appear in both). → [`vaults/architecture/staff-trainers.md`](vaults/architecture/staff-trainers.md).

### 5. Business Rules Summary

1. **Multi-currency** (base USD default, pays in any active local currency via real-time rates). 2) **Atomic Invoicing** (subscription + payment created as one unit). 3) **Strict Isolation** (scoped to `activeOrganizationId`; the panel never uses `|| "global"`). 4–7) **Cumulative Expiration · Grace Period · Immutable financial record · Unique org slug** (note: `FS-0000001` is the SaaS receipt number format via `formatConsoleReceiptNumber`) → [`vaults/business/subscription-rules.md`](vaults/business/subscription-rules.md).

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

Better Auth; client **MUST** use `useOrgAuth()` (org apps) or `usePlatformAuth()` (Console) — never `useSession()` directly; server uses `sessionService`/`getSession()`. Name/Logo SSOT = the `organization` table (`authClient.organization.update()`); tenant identity → `PATCH /api/organizations/profile`; the panel **never** calls `/api/platform/*` from a tenant form; `countryCode` immutable post-creation; `primaryCurrency` editable only inside `active_currencies` (Console picks it at creation, preselected from the country). **CORS is code-only** (`apps/api-worker/src/lib/cors.ts`). Public routes skip auth: `/healthz`, `/favicon.ico`, `/api/auth/*`, `/api/init`, `/api/public/*`.

### 6. Route Handler Pattern (`apps/api-worker/src/lib/route-handler.ts`)

Centralized middleware — never write auth/error boilerplate manually.

| Middleware | When | Auth / Context |
| --- | --- | --- |
| `requireOrgPermission(module, action)` | Org-scoped CRUD | Session + orgId + permission (`hasPermission`, `can()` fallback); sets `orgId` |
| `requireOrg()` | Org-scoped, no permission | Session + active org; sets `orgId` |
| `requireOrgTimezone()` | Routes by local date | Validates tz (500 if missing); sets `orgTimezone` |
| `requireOrgCurrency()` | Money normalized to the primary currency | Validates `primaryCurrency` (500 if missing); sets `orgCurrency` |
| `requireAuth()` | General authenticated | Session + user |
| `requirePlatformPermission(module, action)` | SaaS `/api/platform/*` | Session + platform permission (`auth.api.userHasPermission`, fail-closed `canPlatform()` fallback) |
| `requirePlatformAuth()` | Alias of `requirePlatformPermission('organization','create')` | Session + `organization.create` |

Body via `zValidator('json', schema)`. Global `onError` → `{ error, details? }`; an `HTTPException` with `err.res` is returned **as-is** (business codes: `409 SLUG_TAKEN`, `403 FEATURE_NOT_AVAILABLE`, `400 DOCUMENT_TYPE_INVALID`, `409 SUBSCRIPTION_HAS_PAYMENTS`); toasts resolve by **code**, never text. Typed domain failures map through one mapper by **class**, never message (`exchangeRateErrorResponse` → `503 EXCHANGE_RATE_UNAVAILABLE`).

### 7. Error Handling & Mutations

No silent errors; every mutation uses `try/catch` + `toast.success`/`toast.error`. Toasts **NEVER** show raw API messages: use `mutationError(scope, err, "<generic>")` + `toast.error`; UX-meaningful exceptions map the **error code** (`err.data?.code`), never text.

### 8. HTTP Client (ofetch — NOT native `fetch`)

**Native `fetch` is PROHIBITED**; use **ofetch** — Fit-Stack API always via each app's context-aware client (`apps/{console,panel}/lib/api/client.ts`, a thin instance of `createApiClient` from `@workspace/auth/api-client`: baseURL, cookie forwarding on server, `credentials:"include"`, Zod/API error formatting); external APIs via `ofetch` directly; `next/headers` only to read context. Env: `NEXT_PUBLIC_API_BASE_URL` + `NEXT_PUBLIC_R2_URL` required; `NEXT_PUBLIC_EXCHANGE_URL` optional.

### 9. Date & Timezone Handling

SSOT `packages/shared/src/date.ts`; **NEVER** manual date arithmetic (`Intl.DateTimeFormat`, `toISOString().slice(0,10)`, etc.). tz ALWAYS from the **session** (`activeOrganization.timezone`), never a client param. **Timezone is REQUIRED** — no `?? 'America/Caracas'` (`requireOrgTimezone()`; services take `timezone` without default; column `notNull`). Aggregation by local day in **SQL** (`AT TIME ZONE`). SaaS billing in **UTC**. → [`vaults/business/TIMEZONE_MANAGEMENT.md`](vaults/business/TIMEZONE_MANAGEMENT.md).

### 10. Explicit Configuration Without Silent Fallbacks

**NEVER** invent silent fallbacks (`|| "USD"`, `|| "latam"`, `|| "openrouter"`, `?? 'America/Caracas'`); missing config = visible error. Required (no default): `timezone`/`countryCode`/`primaryCurrency`/`currencyFormat`; extensible → KV `gym_setting` (only fallback `[]`). Org creation derives `primaryCurrency` from the country **only when absent** (Console preselects it but allows another active currency); `active_currencies` always contains the primary, the country currency **and `USD`** (platform operating currency); `POST /api/settings` rejects primary/format (400); no zod `.default()` (defaults in `@workspace/shared/defaults.ts`); UI reads currency/format from the org.

**Official resolvers (source of truth, no fallbacks):** Panel → `requireOrgConfig`/`resolveOrgCurrencyFormat` (`apps/panel/lib/org-config.ts`); Console → `requirePlatformSetting/Currency/CurrencyFormat` (`apps/console/lib/config/platform-settings.ts`) + `currencyFormatForCountry` (`apps/console/lib/config/organization-presets.ts`, **suggestion only**, returns `null` for unknown country — never a read-time fallback). These helpers **are the pattern**; reintroducing `|| "USD"` / `|| "latam"` / `|| "America/Caracas"` or `??` variants is a violation.

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
| API routes / CORS | [`architecture/api-routes.md`](vaults/architecture/api-routes.md) — `/api/subscriptions` has no DELETE (immutable financial record) |
| Cache keys / TTLs | [`architecture/cache.md`](vaults/architecture/cache.md) — Redis down never blocks; invalidate on-write |
| Emails / PDF / queues / sweep | [`architecture/jobs.md`](vaults/architecture/jobs.md) — never sync email/PDF; api-worker never depends on `pdf-lib`; the `FitTaskEvent` contract lives in `@workspace/shared` (`queues/fit-task-events.ts`): validated builders at every send site + `isFitTaskEvent` guard, unknown → ack + error log, never retry |
| R2 storage | [`architecture/file-storage.md`](vaults/architecture/file-storage.md) — every org key starts `<orgId>/` (server-resolved); public only `cms/` + `platform/branding/` |
| Org config resolvers (Panel) | `apps/panel/lib/org-config.ts` — `requireOrgConfig`/`resolveOrgCurrencyFormat`: fail visibly if session org lacks country/timezone/format/primaryCurrency; no fallbacks |
| Platform settings resolvers (Console) | `apps/console/lib/config/platform-settings.ts` — `requirePlatformSetting/Currency/CurrencyFormat`: seeded via `/api/init`; fail visibly if missing |
| Org presets (Console) | `apps/console/lib/config/organization-presets.ts` — `currencyFormatForCountry`: suggestion only (`null` for unknown); never a read-time fallback |
| Package exports / DB schema | [`architecture/packages-and-schema.md`](vaults/architecture/packages-and-schema.md) — 33 tables |
| Modules / Staff & Trainers | [`architecture/modules.md`](vaults/architecture/modules.md), [`staff-trainers.md`](vaults/architecture/staff-trainers.md) |
| Frontend data layer | [`guides/frontend-data-layer.md`](vaults/guides/frontend-data-layer.md) — no raw `fetch`; post-mutation = service → `updateTag` → `router.refresh()`; `updateTag` server-only |
| Testing | [`guides/testing.md`](vaults/guides/testing.md) — unit+integration and E2E are separate layers |
| Pending work / backlog | Linear — project «Fit Stack» (the former `vaults/backlog/` was migrated there) |
| Technical standards (full detail) | [`architecture/technical-standards.md`](vaults/architecture/technical-standards.md) |
| Infra & deploy | [`architecture/INFRASTRUCTURE.md`](vaults/architecture/INFRASTRUCTURE.md), [`terraform.md`](vaults/architecture/terraform.md) |

## Important Constraints

- **Never auto-commit**; the user owns their git history.
- **Tests**: run `pnpm test` before asking for review. Integration tests hit real HTTP against a Neon branch (`TEST_DATABASE_URL`; skipped without it; never against prod). Touch subscriptions/payments/receipts → run the financial invariant tests first.
- **Database changes** require explicit approval; `db:push` forbidden on shared branches.

### When to update AGENTS.md

After structural changes, update `AGENTS.md` **and** the matching `vaults/` doc for: API routes, RBAC, business rules/modules, new app/package, DB workflow, auth/security, CMS blocks, cache keys, queue/email/PDF flows, RSC patterns, E2E config, skills, or the `vaults/` structure.

## Skills Available

Use the `skill` tool: `postgresql-table-design`, `neon-postgres`, `neon-drizzle`, `drizzle-orm`, `better-auth-best-practices`, `organization-best-practices`, `vercel-react-best-practices`, `next-best-practices`, `terraform-stacks`, `rag-implementation`, `rag-knowledge-doc-writer`, `copywriting`, `hallmark`, `find-skills`, `customize-opencode`. Skills live in `.agents/skills/` (project) and `~/.agents/skills/` (global); discover with `npx skills find <query>`.

## Key Files to Read First

- `packages/database/src/schema.ts` (33 tables) · `packages/shared/src/access-control.ts` (RBAC SSOT) · `packages/shared/src/queues/fit-task-events.ts` (`FitTaskEvent` contract: builders + guard)
- `apps/api-worker/src/{index.ts,lib/auth.ts,lib/route-handler.ts,lib/cache.ts,lib/cors.ts,lib/env.ts}` · `apps/jobs-worker/src/index.ts`
- `packages/auth/src/` · `packages/ui/src/components/{modal.tsx,safe-image.tsx,next/image.tsx}`
- `playwright.config.ts` · `e2e/{panel-setup.ts,console-setup.ts}`
- `vaults/architecture/ARCHITECTURE.md` (architecture spec) · pending work: Linear (project «Fit Stack»)

## Infrastructure & Deployment

> Source in `vaults/architecture/ARCHITECTURE.md` §7; infra in `vaults/architecture/terraform.md` (Workers, R2, Queues) managed with Terraform + GitHub Actions. **Never use `wrangler` manually.**


## NOTES:

Any comment, function name, doc, or inline text in the codebase should be in **ENGLISH**.
