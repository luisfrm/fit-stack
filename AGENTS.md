# Fit-Stack Agent Guide

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm test         # Full test suite (shared → api-worker → jobs-worker → panel → console, Vitest)
pnpm test:e2e     # E2E tests (Playwright, launches dev servers automatically)
pnpm seed:e2e       # Demo seed: fills Fit Stack/fit-stack (keeps data, NOT a test)
pnpm format       # Format code (Prettier)

# Database (Drizzle ORM — all run via @workspace/database)
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
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
cd apps/api         # [DEPRECATED] Next.js legacy API — port 3003 (⏸ paused, read-only reference)

# Bridge (Python/Flet — managed separately with uv) ⏸ PAUSED
# cd apps/bridge
# uv sync
# uv run python main.py
```

## Monorepo Structure

- **Apps**: `api-worker` (Hono / Cloudflare Workers API - **Active**), `jobs-worker` (Cloudflare Queues — email + PDF receipts), `panel` (Next.js 16, port 3001), `web` (Next.js 16, port 3002), `console` (Next.js 16, port 3000), `bridge` (Python/Flet desktop, **⏸ PAUSED**), `api` (Next.js 16, **DEPRECATED** — port 3003, ⏸ paused, kept only as reference, excluded from pnpm workspace).
- **Packages**: `auth` (Better Auth client/hooks), `ui` (shadcn/ui), `shared` (DTOs/types/constants/RBAC), `database` (Drizzle ORM + Neon Postgres), `eslint-config`, `typescript-config`
- **Docs**: `docs/` — `PENDING.md`, `FUTURE_IDEAS.md`, `TIMEZONE_MANAGEMENT.md`, `RBAC-STRUCTURE.md`, `PAYMENT_STATUSES.md`, `CHECKLIST-COMPROBANTES.md`, `FACTURATION.md`, `ORGANIZATION_RECEIPT_MODEL.md`, `CHAT_PRICING.md` + `CHAT_INFRASTRUCTURE.md` (AI credits, current) and `CHAT_IMPLEMENTATION.MD` (⏸ DEPRECATED, historical) + `how/` (source of the AI Knowledge Base, end-user tone).
- **Architecture Spec**: For detailed design decisions, see [docs/ARCHITECTURE.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/docs/ARCHITECTURE.md).

- **Bridge is Python** — not part of Turbo, managed separately with `uv`

---

## Project Context (Business Overview)

### 1. Vision

Fit-Stack is a multi-tenant SaaS for the Gym and Fitness industry, primarily targeting the Latin American market. It solves the complexity of multi-currency billing, member retention, and automated physical access control.

- **Multi-tenancy**: Every gym is an `Organization`. Data isolation strictly enforced via `organizationId`.
- **B2B SaaS Model**: "Platform" layer (SaaS Admins) + "CMS" layer (Gym Admins).

### 2. Module Breakdown

| Module                      | Purpose                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Members**                 | Centralized identity for gym clients. Tracks historical behavior and preferences.                                                                                                                                                                                                              |
| **Membership Plans**        | Commercial product catalog. Defines durations (Daily, Weekly, Monthly, Yearly) and pricing in a configurable base currency (USD by default).                                                                                                                                                   |
| **Subscriptions**           | Temporal access control linking a Member to a Plan. Uses **Cumulative Expiration Logic** — renewing adds time to current `endDate` so no paid day is lost.                                                                                                                                     |
| **Payments**                | Financial audit trail. Captures dynamic metadata (bank hashes, reference numbers, screenshots). Prevents duplicate registrations while `processing`.                                                                                                                                           |
| **Platform (SaaS Admin)**   | Super-admin panel in `apps/console`. Manage Organizations, FitStack plans, subscriptions, global settings, currencies, payment methods.                                                                                                                                                        |
| **Staff & Trainers**        | HR and operations separation. Distinguishes business managers (Staff) from service deliverers (Trainers).                                                                                                                                                                                      |
| **Classes**                 | Group activity scheduling (Crossfit, Yoga, etc.) with capacity management.                                                                                                                                                                                                                     |
| **CMS (Dynamic Content)**   | Drag-and-drop pages/blocks (hero, services, testimonials, gallery, contact, team_info). Authored in CMS, rendered in `web` via public API. Panel: `/content/[id]` = SEO config (title, slug, description, metaTitle, metaDescription, isActive) and `/content/[id]/blocks` = DnD block editor. |
| **Routines**                | Exercise library, routine templates, workout sessions, coach-client assignments (future fitness app).                                                                                                                                                                                          |
| **Access Control / Bridge** | Desktop app (Flet/Python) for biometric/QR verification at entry. Sync queue + audit logs. **⏸ Paused** — endpoints live only in legacy `apps/api`, not migrated to api-worker.                                                                                                                |
| **Reports**                 | Revenue analytics with multi-currency normalization.                                                                                                                                                                                                                                           |
| **Settings**                | Localization and branding per gym (Timezone, currency formats, country config, OKLCH theme injection).                                                                                                                                                                                         |

### 3. Staff & Trainers Architecture

**Data model:**

- `gym_member` (base table) — all gym members: clients, staff, trainers
- `coach_profile` (extension) — optional 1:1 for gym_members with role `COACH`. Fields: `specialities`, `bio`, `isVisible`, `displayOrder`
- `auth_member` — Better Auth membership linking user ↔ organization with role (`OWNER`, `MANAGER`, `CASHIER`, `COACH`, `MEMBER`)
- `coach_assignment` — links a coach (gym_member) to a client (gym_member)

**Staff (`/dashboard/staff`):**

- Table view for gym_members with roles: Owner, Manager, Cashier, Coach
- Components: `StaffTable`, `StaffModal`, `StaffForm` (`apps/panel/components/staff/`)
- Columns: Avatar+Name, Email, Role, Status, Actions
- Service: `membersService` (shared with Members module)

**Trainers (`/dashboard/trainers`):**

- Table view for gym_members with role `COACH` that have a `coach_profile`
- Components: `TrainersTable`, `TrainerModal`, `TrainerForm` (`apps/panel/components/trainers/`)
- Fields: name, photo, specialities, bio, visibility toggle, display order
- Service: `trainersService` (joins gym_member + coach_profile)
- API routes: `/api/trainers`

**Note**: Trainers appear in both views (staff table + trainers table) because they are gym_members with role `COACH`.

### 4. The Bridge App (Hardware Integration)

A Python/Flet desktop application running locally at the gym entrance. Communicates with the API to validate a member's QR/Biometric data against their active subscription, turning "billing data" into "physical access."

**API contract** (authenticated via `x-api-key` header → `ACCESS_CONTROL_API_KEY`):

- `POST /api/access-control/verify` — validate `documentId` + `organizationId`, returns access decision, creates audit log
- `GET /api/access-control/sync-tasks` — poll pending biometric enroll/delete tasks
- `POST /api/access-control/mark-synced` — confirm task completion

**Tables**: `access_control_log` (audit trail of every access attempt), `biometric_sync_task` (queue of sync tasks for devices)

> **⏸ Status: PAUSED.** The Bridge and `apps/api` are paused. The 3 endpoints (`/verify`, `/sync-tasks`, `/mark-synced`) and the `access-control.repository.ts` repository exist **only in `apps/api` (legacy)** — the active `apps/api-worker` does **not** mount `/api/access-control` yet. There is no migration in progress. When reactivated, port it to a `createAccessControlRepository(db)` factory + Hono router with `requireApiKey` middleware, and add `ACCESS_CONTROL_API_KEY` to `apps/api-worker/src/lib/env.ts` + Terraform `secret_text_bindings`.

### 5. Business Rules Summary

1. **Multi-currency**: System thinks in a base currency (USD by default) but allows payment in any active local currency via real-time exchange rates. Both configurable dynamically in **Settings**.
2. **Atomic Invoicing**: Subscriptions and Payments are created as an atomic unit to ensure financial and temporal data never desync.
3. **Strict Isolation**: No gym sees another gym's data. Everything scoped to `activeOrganizationId` in the session. Panel never uses a `|| "global"` fallback — it is always org-scoped via `(protected)/layout.tsx` (renders `OrganizationPicker` if no org); platform-scoped logic lives in console-specific services.
4. **Cumulative Expiration**: Renewing a subscription extends from the current `periodEnd` (not today), preserving all paid days.
5. **Grace Period Billing**: Platform subscriptions have a tiered grace period: 1-7 days overdue → `past_due`, 8-14 days → `read_only`, 15+ → `suspended`.
6. **Registro financiero inmutable**: una suscripción con su pago **nunca se elimina** — `subscriptions` no expone `delete` a ningún rol y no existe `DELETE /api/subscriptions/:id`. Si el registro está equivocado se **anula** (el cobro pasa a `voided` y la suscripción se computa `ANULADA`); si se revoca el acceso se **cancela**. Anular ≠ cancelar: `voided` = registro inválido, `cancelled` = el acceso se revocó con un cobro que sigue siendo válido.
   - **Payment statuses unificados**: `PAYMENT_STATUSES = processing | validated | voided | refunded` (sin `pending`/`invalid`). El rechazo y la anulación comparten `voided`; el tipo se **deriva** con `getVoidKind` (`rejected` sin `receiptNumber` / `annulled` con él). Solo `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) sostienen un periodo. Al anular se persisten siempre `voided_by`/`voided_at`/`void_reason`.
   - **Void por dominio**: en **Panel** un pago `voided` deja la suscripción **ANULADA** (anula el servicio); en **Console/SaaS** un `voided` se **ignora** en el status computado (no revoca servicio; la gracia corre desde `currentPeriodEnd` y no se acumula). Gate free tier: si está habilitado, manda; si no hay suscripción se evalúa free tier; si no, `/no-subscription`.
7. **Unique org slug**: `organization.slug` is unique (DB `text('slug').unique()`). Conflicts return **409 `{ code: 'SLUG_TAKEN' }`** (create/update service + `GET /api/platform/organizations/check-slug`). Console validates **live** in `organization-form.tsx` (debounce 500ms → input `success`/`error` + toast) and the org detail pages are routed **by slug** (`/organizations/[slug]/...`, resolved via `GET /api/platform/organizations/by-slug/:slug`).

---

## Project Rules (Technical Standards)

### 1. Monorepo Architecture & Boundaries

- **Package Separation**: Respect boundaries between `apps/` and `packages/`. Logic belonging to a package MUST NEVER be duplicated in an app.
- **Strict Isolation**: Don't mix API and Frontend contexts. Never import anything between apps directly; the only allowed interaction is through shared packages (`packages/shared`).
- **Shared Logic & Types**: Use `@workspace/shared` for interfaces, DTOs, constants, and permission helpers shared between backend, frontend, or other consumers.
- **Type Safety**: Avoid `any`. Prioritize strict, strong typing everywhere.
- **Backend 3-Layer Strict Separation**: Route Handler → Service → Repository.
  - Repository: Drizzle ORM, filter by `organizationId` for multi-tenancy.
  - Service: Business logic layer.
  - Route Handler: HTTP concerns only.
- **Worker DB Pattern**: In `api-worker` the DB client is created **per request** via `createDb(c.env.DATABASE_URL)` (`@workspace/database/factory`) — `process.env` does not exist in Workers. Repositories and services are **factory functions** that receive dependencies by parameter (`createXRepository(db)`, `createXService(repo)`).
- **Shared repositories (conscious exception, not a general rule)**: repositories live in the app — UNLESS 2+ apps need the byte-identical implementation (criterion: same SQL, same atomicity guarantees). Only then it lives in `packages/database/src/repositories/` (today solely `receipts.repository.ts`: atomic numbering + `getReceiptComposedData` + `completeReceiptPdf`, consumed by api-worker step 1 and jobs-worker step 2 — plus `platform-receipts.repository.ts`: the SaaS mirror, same criterion). Any other new repo stays in `apps/api-worker/src/repositories/`. This exception exists because two runtimes need identical SQL; it does not authorize moving business logic or other repos.

### 2. UI Design System & Hierarchy

- **Library Origins**: All UI components MUST be imported from `@workspace/ui` (`packages/ui`).
- **Form required convention**: `Input` uses native `required`; `CountrySelector` and `SimpleSelect` accept a `required` prop (renders `*` on the label). Forms group into sections and close with the note "Los campos con _ son obligatorios." (Fields with _ are required.)
- **ActiveCurrenciesField** (`packages/ui/.../active-currencies-field.tsx`): currency multi-toggle (`currencies` universe, `value/onChange`, `locked[]` not uncheckable with badge, `disabled`, search). Source of truth for the universe: `COUNTRY_INDEX.currencies` (never the exchange API, which is only for rates).
- **Variant Enforcement**: Use predefined variants. Do not use ad-hoc Tailwind classes to override sizes/spacing/styles unless absolutely necessary and after notifying the user.
- **Mathematical Scale + Premium Aesthetic**:
  - **Backgrounds**: `bg-input`, `bg-card`, `bg-surface`, translucent scales (`bg-white/5`, `bg-white/10`).
  - **Borders**: Low opacity boundaries (`border-white/5`, `border-white/10`, `border-input-border`) over solid hexes. Limit solid colors to focus rings.
  - **Border Radius**:
    - Inputs, Buttons, CheckboxCards → `rounded-md`
    - Cards, Containers → `rounded-xl`
    - Modals, Dialogs → `rounded-2xl`
- **Responsive Modal** (`packages/ui/src/components/modal.tsx`): renders a **bottom sheet** (drag handle + drag-to-close, `rounded-t-2xl`) on mobile (<768px via `useIsMobile`) and a **centered modal** on desktop. Exports the legacy `Modal` (same API: `trigger`/`title`/`description`/`footer`/`size`/`isScrollable`/`open`/`onOpenChange`) and the composite API `ResponsiveModal` / `ResponsiveModalTrigger` / `ResponsiveModalClose` / `ResponsiveModalContent` (icon, subtitle, `desktopMaxWidth`). Built on `radix-ui` Dialog; open/close animations are **custom keyframes** in `packages/ui/src/styles/globals.css` (`animate-sheet-in/out`, `animate-modal-in/out`) that animate `translate`/`scale` so they don't clash with Tailwind v4 centering; the overlay uses `tw-animate-css` (`data-open:`/`data-closed:`). Hook `useIsMobile` in `packages/ui/src/hooks/use-is-mobile.ts`.

### 3. Database Integrity & ORM

- **ORM**: Always Drizzle ORM. All DB code from `@workspace/database`.
- **Workflow**: `generate` → `review` → `migrate`. NO `push`, `generate`, `migrate`, or `seed` without explicit user approval.
- **Push Restriction**: `db:push` is EXCLUSIVELY for local prototyping. Strictly prohibited on shared branches or production.
- **Naming**: Table names are **singular** (`user`, `organization`). Repositories and Services are **plural** (`users.service.ts`).
- **No `pgEnum`**: Use plain `text('col')` — no `.$type<...>()` annotation. The DB treats these columns as plain strings. Allowed values are validated exclusively by Zod schemas on the backend and by the frontend; they never live in the DB layer. pgEnum is strictly forbidden (breaks Drizzle migrations).
- **Validation**: Run `pnpm db:check` before pushing. CI verifies on PRs automatically.
- **Sin transacciones interactivas (serverless)**: `api-worker` corre en Cloudflare Workers con el driver **HTTP** de Neon, donde `db.transaction()` interactivo **no existe**. La atomicidad se consigue por **sentencia única** (patrón canónico: el correlativo de comprobantes, `INSERT … ON CONFLICT DO UPDATE … RETURNING`) o por **compensación explícita** en el `catch` del service. Nunca envolver varias escrituras en una transacción ni asumir rollback automático.

### 4. Next.js Patterns & Best Practices

- **Server First**: `"use client"` only at leaf nodes. Default to Server Components. Fetch data server-side where possible.
- **State in URL**: Prefer URL state (`?search=foo`) over `useState` for pagination, tabs, global searches.
- **Async Params**: `params` and `searchParams` are **Promises** in Next.js 15+. Declare as `Promise<...>` and `await`.
- **Navigation**: Use `useRouter` from `next/navigation`, never `window.location`. Use `router.refresh()` to sync server state after auth/org changes.
- **Proxy/Middleware**: Heavy logic stays out of the proxy file. Use solely for CORS, header manipulation, and early session validation. The proxy file is **`proxy.ts`** (Next.js 16 convention, replaces `middleware.ts`).

### 5. Security & Authentication Architecture

Fit-Stack uses **Better Auth** for authentication.

**Package layers:**

- **`@workspace/auth`** — canonical auth package. Entry points:
  - `@workspace/auth/client` — raw `authClient`, `useSession`, `organization`
  - `@workspace/auth/service` — `sessionService.getSession()` for server components
  - `@workspace/auth/hooks` — `useAuth()` with role flags + `usePermissions()` with `can(module, action)` and `canAccessCms()`
- **`apps/panel/lib/auth-client.ts`** and **`apps/console/lib/auth-client.ts`** — re-export `@workspace/auth/client`
- **`apps/panel/lib/hooks/use-auth.ts`** — re-exports `useAuth` and `usePermissions` from `@workspace/auth/hooks`

**Conventions:**

- Client MUST use `useAuth()`. It exposes `activeOrganization` (the org object, resolved by the api-worker custom session) alongside `member`. NEVER use `useSession()` directly in components.
- For server Components/Layouts/API layers: `sessionService` or server-side `getSession()`.
- **Source of Truth**: The `organization` table (Better Auth) is the sole source for Name/Logo. Use `authClient.organization.update()`.
- **Escritura de la sede en el panel**: la identidad de la organización (name/slug/logo/slogan/timezone/currencyFormat + legalName/taxId/address/`fiscalConfig`) se guarda con `orgProfileService.updateProfile` → **`PATCH /api/organizations/profile`** (org-scoped, `ORGANIZATION.UPDATE`). El panel **nunca** llama a `/api/platform/organizations` desde un formulario de tenant: ese endpoint exige `requirePlatformAuth` (permiso de plataforma) y un owner/manager de gym recibe **403**. `countryCode`/`primaryCurrency` son inmutables post-creación (400 `IMMUTABLE_FIELD`); cambiar el país recalcula la moneda principal y es operación de nivel plataforma.

#### CORS & Allowed Origins

The CORS allowlist is defined **in code only** — no env vars. Single source of truth in `apps/api-worker/src/lib/cors.ts`, consumed by:

- `apps/api-worker/src/lib/auth.ts` → `trustedOrigins` of Better Auth
- `apps/api-worker/src/index.ts` → `corsMiddleware` (Hono CORS)

| Environment   | Allowed origins                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `development` | Any `http://localhost:*` (3001 panel, 3002 web, 3003 console, 8787 jobs, 8788 api)                                                                                 |
| `production`  | Exact: `fitstack-panel.luisrivas.site`, `fitstack-console.luisrivas.site`, `fitstack-api.luisrivas.site`, `luisrivas.site` · Wildcards: `https://*.luisrivas.site` |

**Public routes skip auth**: `/healthz`, `/favicon.ico`, `/api/auth/*`, `/api/init`, `/api/public/*`. The global middleware tries to resolve a session but never blocks unauthenticated requests — machine-to-machine routes (e.g. access-control with `x-api-key`) work without a session.

### 6. Route Handler Pattern (`apps/api-worker/src/lib/route-handler.ts`)

The Hono API uses centralized middleware — never write auth/error boilerplate manually.

| Middleware                                  | When to use                                                                                                       | Auth check / Context                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `requireOrgPermission(module, action)`      | Org-scoped CRUD routes                                                                                            | Session + orgId + permission via `auth.api.hasPermission` (with `can()` fallback). Sets `c.set('orgId', orgId)` |
| `requireOrg()`                              | Org-scoped routes without permission check                                                                        | Session + active org. Sets `c.set('orgId', orgId)`                                                              |
| `requireOrgTimezone()`                      | Routes that compute or filter by local date (reports, stats, billing)                                             | Validates the org has a timezone (500 if missing). Sets `c.set('orgTimezone', tz)`                              |
| `requireAuth()`                             | General authenticated routes                                                                                      | Session + user only                                                                                             |
| `requirePlatformPermission(module, action)` | SaaS admin routes (`/api/platform/*`)                                                                             | Session + platform permission via `auth.api.userHasPermission`                                                  |
| `requirePlatformAuth()`                     | Alias of `requirePlatformPermission('organization', 'create')` — standard middleware for `/api/platform/*` routes | Session + `organization.create` permission                                                                      |

```ts
// Typical org-scoped route (Hono)
.get('/', requireOrgPermission(PM.MEMBERS, PA.READ), async (c) => {
  const orgId = c.get('orgId')!;
  const repo = createMembersRepository(c.get('db'));
  const service = createMembersService(repo, /* ...deps */);
  return c.json(await service.getAllMembers({ organizationId: orgId }));
})
```

- Body validation via `zValidator('json', schema)` from `@hono/zod-validator` (+ `zod`).
- Errors are normalized by the global `onError` handler (`apps/api-worker/src/lib/errors.ts`) → `{ error, details? }` envelope. Un `HTTPException` que traiga su propia `Response` (`err.res`) se devuelve **tal cual**: así llegan los códigos de negocio documentados (`409 { code: 'SLUG_TAKEN' }`, `403 { code: 'FEATURE_NOT_AVAILABLE', feature }`) — los toasts se resuelven por código, nunca por texto.
- The legacy `apps/api/lib/route-handler.ts` (`withAuth` / `withSession` / `withPlatformAuth`) is **deprecated** with the old API.

#### API Route Map (api-worker)

Routes mounted in `apps/api-worker/src/index.ts` (all under `/api`, except `/healthz` and `/favicon.ico`):

| Router               | Notable endpoints                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*`        | Better Auth engine (sessions, orgs, invitations)                                                                                                                                                                                                                                                                                                                                     |
| `/api/members`       | CRUD gym members + invites (`members.service` enqueues `email.registration_invite`) · `GET /stats` (client KPIs: total/active/inactive/newThisMonth/withoutActiveSubscription/withPortal + growth 6M + upcomingBirthdays, cache `org:*:members:stats`) · `GET /` accepts `?hasActiveSubscription=` (JOIN with gym-active semantics, `processing` counts as active) |
| `/api/plans`         | Membership plans (gym catalog)                                                                                                                                                                                                                                                                                                                                                       |
| `/api/subscriptions` | Subscriptions (create/list/update-status; payment registration enqueues `email.payment_receipt`) — **sin DELETE** (registro financiero inmutable) |
| `/api/payments`       | `PATCH /:id/status` accepts `processing \| validated \| voided` + optional `voidReason` (retired `pending`/`invalid` → **400**); returns the explicit void outcome (`receiptVoided` + `receiptVoidReason`). `POST /:id/send-email` (receipt resend) |
| `/api/classes`       | Class schedule CRUD                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/trainers`      | Trainers (gym_member + coach_profile)                                                                                                                                                                                                                                                                                                                                                |
| `/api/cms`           | Content pages/blocks                                                                                                                                                                                                                                                                                                                                                                 |
| `/api/dashboard`     | KPI stats (`GET /stats`, cache `org:*:dashboard:stats:*`) + actionable lists (`GET /action-items`, cache `org:*:dashboard:action-items`)                                                                                                                                                                                                                                             |
| `/api/settings`      | Gym settings (currencies, payment methods, theme)                                                                                                                                                                                                                                                                                                                                    |
| `/api/reports`       | `GET /revenue` (multi-currency, cache 1h) · `GET /receipts` (auditoría del correlativo: filas + resumen + totales por moneda + `gaps[]`, filtros `from/to/status/method/year/page/limit`, cache 5 min) |
| `/api/organizations` | `GET /subscription-status` (org billing status) · `GET /subscription` (org SaaS sub with plan details, cache 1 min) · `GET /payment-methods` (platform payment methods exposed to the org, cache 10 min) · `POST /subscription/renew` (self-service renewal — see "Self-service renewal" below) · `PATCH /profile` (identidad de sede —name/slug/logo/slogan/timezone/currencyFormat— + identidad emisora + `fiscalConfig` merge, `countryCode`/`primaryCurrency` immutable, invalidates `org:{id}:profile`) |
| `/api/upload`        | Uploads del **panel** (org de la SESIÓN): `GET /` (list), `DELETE /`, `PUT /direct`, `POST /presigned` con `requireOrgPermission(MEMBERS, CREATE)` + `GET /file?key=` (entrega autenticada de assets privados, `MEMBERS.READ`). Keys `<orgId>/<folder>/…`; `organizationId` **no existe** en el contrato |
| `/api/ai`            | `POST /chat` (SSE chat streaming: OpenAI SDK → fixed OpenRouter chain or Workers AI GLM, pre-generation RAG + `PANEL_SYSTEM_PROMPT`, `ai_chat` quota with RAG cap in pre-flight + `X-Ai-Credits-*` headers), `GET /models` (allowlist), `GET /usage` (AI quotas), `GET /conversations` + `PUT /conversations/:id` (upsert 1 conv, cap 10 msgs) + `DELETE /conversations/:id` (Redis) |

> **AI Chat**: the provider is inferred from the model id (`getAiProvider` in `@workspace/shared`). Fixed OpenRouter model chain (`OPENROUTER_TEXT_MODEL_CHAIN`) with fallback to GLM in Workers AI. The first SSE event is `{"model": ...}` with the concrete model that responded. `OPENROUTER_API_KEY` optional; if missing and an OpenRouter model is requested → 503. 1 credit = 1K tokens ×1.0 (`AI_CREDIT_CONSTANTS`), limits `AI_CHAT_LIMITS`, monthly cycle per subscription, RAG with embeddings `@cf/baai/bge-m3` (see `docs/CHAT_PRICING.md` / `CHAT_INFRASTRUCTURE.md`). |
> | `/api/init` | Org bootstrap (no auth) |
> | `/api/public` | `GET /pages/:slug` (public CMS, cache 15 min) · `GET /files/*` (R2) — no auth, **allowlist**: solo `<orgId>/cms/…` y `platform/branding/…`; el resto 404 |
> | `/api/platform/plans` | SaaS plan catalog (console) |
> | `/api/platform/subscriptions` | SaaS subscriptions + invoices + `GET /stats` + `GET /revenue?months=12` (monthly UTC buckets, validated only, cache 1h) + `GET /receipts` (auditoría del correlativo `FS-N`: filas + resumen + totales por moneda + `gaps[]`, filtros `from/to/status/method/year/page/limit` en UTC, cache 5 min, `subscription:list` — support reads) + `GET /by-organization/:orgId/invoices` (SaaS invoice history per org, cache 5 min) + `GET /payments/:id/receipt` (3-state contract, `subscription:list` — support reads) + `GET /payments/:id/receipt/pdf` (binary, `subscription:list`) + `POST /payments/:id/resend` (4 branches, `requirePlatformAuth` — support 403) |
> | `/api/platform/organizations` | Platform org CRUD (console) + `GET /check-slug` (disponibilidad en vivo, 409 `{ code: 'SLUG_TAKEN' }` si está en uso) + `GET /by-slug/:slug` (detalle por slug, `?includeMemberCount=`) + `GET /:id/ai-usage` (AI quota del ciclo, cache 5 min, invalidada en grant) + `GET /:id/gym-overview` (adopción gym + portal seats, cache 5 min, staleness aceptada: writes del gym no invalidan claves platform) |
> | `/api/platform/settings` | Platform global settings |
> | `/api/platform/staff` | Platform staff (console invites → enqueues `email.registration_invite`) |
> | `/api/platform/upload` | Assets de plataforma SIN organización — `POST /presigned`, `PUT /direct`, `GET /` (list), `GET /file`, `DELETE /` — auth `requirePlatformAuth`, **scope fijo `platform/branding/`** (único prefijo de plataforma público) |
> | `/api/platform/organizations/:id/upload` | Assets de UNA organización desde el console: la org va por **path** (nunca body/query) + `assertOrganizationExists` — `POST /presigned`, `PUT /direct`, `GET /` (list), `GET /file`, `DELETE /`; keys `<orgId>/…`, `requirePlatformAuth` |
> | `/api/platform/features` | Feature catalog (`GET /`, cache `platform:features`) |
> | `/api/platform/knowledge` | AI Knowledge Base CRUD (platform docs, bge-m3 embeddings, no Redis cache) — `GET /:id/content` (content only, no chunks, for editing without transferring embeddings) |
> | `/api/organizations/features` | Resolved features of the active org + `isFreeTier` (panel gate, cache `org:*:features`) |
> | `/api/organizations/seats` | Portal seats of the active org (`{ used, limit, pending }`) |

> `/api/access-control/*` is **NOT mounted** in api-worker (Bridge paused — see section 4).

### 7. Error Handling & Mutations

- **User Feedback**: No silent `console.log()` errors in production. All mutations MUST use `try/catch` with `toast.success`/`toast.error` from explicit server responses.
- **Toasts and API errors (rule)**: toasts NEVER show raw API messages (`err?.data?.error`, `error.message`, server string matching). Mandatory pattern: `mutationError(scope, err, "<generic action message>")` (helper in `apps/{panel,console}/lib/errors.ts` — logs the raw error with `console.error` and returns the fallback) + `toast.error(...)`, e.g. "No se pudo guardar el plan". Exceptions with UX meaning (e.g. AI quota exhausted) are handled by mapping the **error code** (`err.data?.code`), never by text.
- **Implementation Plans**: Write in **Spanish**. Always ask for explicit approval before implementing.

### 8. HTTP Client (ofetch — NOT native `fetch`)

**Native `fetch` is PROHIBITED.** All HTTP requests use **ofetch**:

- **Fit-Stack API (api-worker)** → ALWAYS through each app's context-aware client:
  - Console: `apps/console/lib/api/client.ts` (export `api`)
  - Panel: `apps/panel/lib/api/client.ts` (exports `api` and `apiBlob`)
  - The client adds `baseURL` (`${apiBaseUrl}/api`), **forwards cookies on server** (RSC), `credentials: "include"` on client, `retry`/`timeout`, and intercepts `ORGANIZATION_NOT_FOUND`.
  - Server actions that invalidate cache (`updateTag`) + `router.refresh()` do NOT make HTTP requests — they combine with `api()` for the calls.
- **External APIs** (e.g. exchange rates from open.er-api.com) → `ofetch` directly, WITHOUT going through the internal client (which must not send session or API baseURL). See `apps/{console,panel}/lib/api/exchange-rates.ts` with `next: { revalidate }` for Next cache.
- `next/headers` (`cookies()`, `headers()`) is used only to read request context — never to make the HTTP request.

**Frontend env vars** (`apps/{panel,console}/lib/config/envs.ts`, Zod-validated): `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_R2_URL` (required); `NEXT_PUBLIC_EXCHANGE_URL` (optional, read in `lib/api/exchange-rates.ts`, default `https://open.er-api.com/v6/latest`).

---

### 9. Date & Timezone Handling

- **Single source of truth**: `packages/shared/src/date.ts` (exported by `@workspace/shared`), built on `date-fns` + `@date-fns/tz` (both purely functional, edge-safe). **NEVER** reintroduce manual date arithmetic (`Intl.DateTimeFormat("en-CA")`, `new Date().toISOString().slice(0,10)`, offsets with `padStart`, `setUTCMonth`, `Math.floor(ms / 86_400_000)`).
- **Business rule**: a payment at 11pm in Venezuela must land on the **same local day**. To achieve this, the tz is ALWAYS resolved from the **session** (`session.activeOrganization.timezone`, cached 5 min in `org:{orgId}:profile`), **never** from a client query param (`?timezone=`).
- **Timezone is REQUIRED**: no fallback `?? 'America/Caracas'`. If the org doesn't have one, it's an error.
  - **API**: Composable middleware `requireOrgTimezone()` (`apps/api-worker/src/lib/route-handler.ts`) validates the org has a timezone (500 if missing) and injects it typed into `c.get('orgTimezone')!`. Used in `subscriptions`, `reports`, `plans`, `dashboard` and `payments`.
  - **Services**: `finance`, `plans`, `reports`, `dashboard`, `settings`, `subscriptions` require `timezone: string` **without default**.
  - **Org creation (console → `/api/platform/organizations`)**: `timezone` is `required` in `createOrgSchema`, validated in `organizations.service.createOrganization`, and `required: true` in `ORGANIZATION_ADDITIONAL_FIELDS` (Better Auth). The `organization.timezone` schema is `notNull` **without default** (DB).
- **SQL vs JS**: **aggregation** by local day/month (reports, daily revenue) is done **in SQL** with `AT TIME ZONE`. The JS util resolves the **input** (local day boundaries as UTC `Date` for the `WHERE gte/lte`) and the **display**; it doesn't replace Postgres.
- **UI** (panel/console): local "today" is obtained with `toLocalDayString(orgTimezone)`; parsing `'YYYY-MM-DD'` with `parseDateAsConfigTimezone(dateStr, tz)` (alias of `parseLocalToUtc`). Wall-clock helpers (`formatTime`/`formatTimeRange`) live in `apps/{panel,console}/lib/config/display.ts`, which re-exports the tz helpers from `@workspace/shared`.
- **`billing-utils.ts`** (api-worker) is **platform** (SaaS) billing and operates in UTC — it's not mixed with org tz.

### 10. Explicit Configuration Without Silent Fallbacks (Seeding)

- **Golden rule**: NEVER invent silent fallbacks in frontend or backend code (`|| "USD"`, `|| "latam"`, `["USD", "VES"]`, `|| "openrouter"`). If a configuration is missing, it must be a visible error, not silently assumed behavior.
- **Taxonomy**: **required** are `NOT NULL` columns without default in `organization` (`timezone`, `countryCode`, `primaryCurrency`, `currencyFormat`) — a single `insert` at creation, impossible to miss. **Extensible** lives in KV (`gym_setting`: `active_currencies`, `active_payment_methods`, `brand_*`) with the only allowed fallback `[]`/safe parse. Guards over **data** (`currencyPaid`, `planCurrency` in UI) are not config and stay, documented.
- **Org creation** (`organizations.service.createOrganization`): derives `primaryCurrency = COUNTRIES[countryCode].currency`, accepts explicit `currencyFormat` (`'latam'` is the **write** default) + `settings` override (`{ ...buildDefaultOrgSettings(cc), ...settings }`); seeds only extensible stuff. Changing `countryCode` recalculates the primary. `POST /api/settings` rejects `primary_currency`/`currency_format` (400).
- **User creation** (the 3 flows: `POST /api/members`, `POST /platform/organizations/:id/staff`, `POST /platform/staff`): no `.default()` in zod — defaults in `@workspace/shared/defaults.ts` (`DEFAULT_MEMBER_VALUES`, `DEFAULT_ORG_STAFF_VALUES`, `DEFAULT_PLATFORM_STAFF_VALUES`) resolved with spread in route/service.
- **Platform seeding (`platform_setting`)**: unchanged (KV singleton, seeded in `/api/init` via `DEFAULT_PLATFORM_SETTINGS`).
- **UI reads**: currency/format are read from the org (`session.activeOrganization` / `useAuth().activeOrganization`), never from settings. The panel Currencies page only edits `active_currencies` (primary readonly); the format is edited in Location Settings.

### 11. Money Convention (integer cents)

- **Golden rule**: ALL money travels and stores as **integer cents** — DB (`bigint`), API contracts (`z.number().int()`), services, tests, seeds, E2E fixtures. `exchangeRateApplied` is a rate, not money — it stays `numeric(10,4)`.
- **Display**: ONLY via `formatCents(cents, currency, format)` from `@workspace/shared` (single source; `ValueConverter` lives there too). Inline `/ 100` for money display is PROHIBITED.
- **Unit inputs** (forms editing "50.00"): convert at the boundary with `centsToUnits` / `unitsToCents` from `@workspace/shared`. Fiscal math (`tax-math`, `receipt-data`) operates in integer cents and rounds with `roundCents` — the only place that rounds money.

---

## Storage de Archivos (R2)

Bucket único (`FILES_BUCKET`) con **taxonomía por prefijo**: el primer segmento de la key es la organización.

| Key | Escribe | Lectura |
| --- | --- | --- |
| `<orgId>/cms/…` | panel (CMS) | **pública** (`/api/public/files/*`): es el sitio |
| `<orgId>/<folder>/…` (`general`, `members`, `staff`, `trainers`, `receipts`…) | panel / console | **privada**: `/api/upload/file` (panel) · `/api/platform/organizations/:orgId/upload/file` (console) |
| `platform/branding/…` | console | **pública** (login y correos, sin sesión) |
| `receipts/<org>/<año>/<n>.pdf` · `platform/receipts/<año>/FS-<n>.pdf` | solo el renderer (`putFile`) | rutas autenticadas de comprobantes |

- **Regla de oro**: toda key org-scoped empieza por `<orgId>/` y toda escritura/borrado valida ese prefijo contra la organización **resuelta en el servidor** (sesión en el panel, path en el console). El cliente nunca elige la organización de la carpeta.
- **Folder saneado**: `safeFolderSegment` (`slugify`) neutraliza `../` y separadores, y la extensión se limpia (`getFileExtension`). Ninguna carpeta del cliente puede escapar del scope.
- **Público por diseño** = `isPublicStorageKey` (`@workspace/shared`, consumido por el route público y por el `getMediaUrl` de panel/console). Sin excepciones inventadas: si un asset debe verse en el sitio público, va en `cms`.
- **Assets privados en la UI**: `getMediaUrl` devuelve la URL pública para keys públicas y `/api/media?key=…` para las privadas (proxy Next autenticado que reenvía la cookie al API). Nunca una URL de R2 adivinable desde el navegador.
- **Inmutabilidad estructural**: los comprobantes emitidos viven en un namespace que ninguna ruta de upload alcanza, y el branding SaaS (`platform/receipts/…`) no es alcanzable desde `/api/platform/upload` (scope fijo `platform/branding/`).

---

## Redis Caching (Upstash)

The API uses **Upstash Redis** (`@upstash/redis` v1.37.0) for serverless-compatible caching.

### Setup

- **Wrapper**: `apps/api-worker/src/lib/cache.ts` — `createCache(env)` with error handling; Redis being down never blocks requests (graceful degradation).
- **Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both optional)

### Cache Methods

| Method            | Signature                      | Description                                         |
| ----------------- | ------------------------------ | --------------------------------------------------- |
| `get`             | `get<T>(key: string)`          | Fetch cached value by key                           |
| `set`             | `set(key, data, ttlSeconds?)`  | Store value with optional TTL (default 5 min)       |
| `invalidate`      | `invalidate(pattern: string)`  | Delete all keys matching a glob pattern (uses SCAN) |
| `invalidateExact` | `invalidateExact(key: string)` | Delete a single key                                 |

### Cache Key Conventions

| Pattern                                    | TTL    | Used For                                                                                          |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `org:${orgId}:settings`                    | 1 h    | Organization settings (invalidated on-write in POST /api/settings)                                |
| `org:${orgId}:profile`                     | 5 min  | Active org profile in custom session (branding/theme/timezone)                                    |
| `org:${orgId}:plans:*`                     | 1 h    | Membership plans (invalidated on-write in POST/PUT/DELETE /api/plans)                             |
| `org:${orgId}:classes:*`                   | 5 min  | Classes                                                                                           |
| `org:${orgId}:members:*`                   | 5 min  | Gym members                                                                                       |
| `org:${orgId}:members:stats`                | 5 min  | Member KPIs (`GET /api/members/stats`; cross-invalidated on subscription/payment writes because `withoutActiveSubscription` depends on subs/pagos) |
| `org:${orgId}:subscriptions`               | 5 min  | Member subscriptions                                                                              |
| `org:${orgId}:dashboard:stats:*`           | 5 min  | Dashboard KPIs                                                                                    |
| `org:${orgId}:dashboard:action-items`      | 5 min  | Dashboard actionable lists (expiring soon / recently expired)                                     |
| `org:${orgId}:coaches:*`                   | 5 min  | Coaches/trainers                                                                                  |
| `org:${orgId}:cms:*`                       | 5 min  | CMS invalidation (reads are not cached)                                                           |
| `org:${orgId}:public:page:*`               | 15 min | Public page slugs (web)                                                                           |
| `org:${orgId}:subscription-status`         | 1 min  | Org billing status                                                                                |
| `org:${orgId}:subscription`                | 1 min  | Org SaaS sub with plan details (self-service renewal)                                             |
| `org:${orgId}:payment-methods`             | 1 h    | Platform payment methods exposed to the org (invalidated on-write in POST /api/platform/settings) |
| `rates:${base}`                            | 1 hr   | Server-side exchange rates (open.er-api.com, provider in `api-worker/src/lib/exchange-rates.ts`)  |
| `org:${orgId}:features`                    | 5 min  | Resolved features + isFreeTier of the org                                                         |
| `org:${orgId}:reports:revenue:12m`         | 1 hr   | Monthly revenue reports                                                                           |
| `org:${orgId}:reports:receipts:*`          | 5 min  | Receipts audit report (invalidated on-write in issue/status/subscription writes)                  |
| `member:role:${userId}:${orgId}`           | 1 min  | Cached Better Auth member role (custom session)                                                   |
| `platform:settings`                        | 1 h    | SaaS-level global settings (invalidated on-write in POST /api/platform/settings)                  |
| `platform:features`                        | 10 min | Feature catalog (console)                                                                         |
| `platform:organizations*`                  | 5 min  | Organization list (SaaS admin)                                                                    |
| `platform:plans*`                          | 1 h    | Platform plan catalog (invalidated on-write in /api/platform/plans)                               |
| `platform:subscriptions*`                  | 5 min  | SaaS subscriptions                                                                                |
| `platform:subscriptions:stats`             | 5 min  | Subscription KPI stats                                                                            |
| `platform:subscriptions:revenue:{months}m` | 1 h    | Monthly SaaS revenue series (invalidada on-write vía `platform:subscriptions*`)                   |
| `platform:ai-usage:{orgId}`                | 5 min  | AI quota por org (invalidada en `POST /:id/ai-credits`)                                           |
| `platform:subscriptions:invoices:{orgId}`  | 5 min  | SaaS invoices per org (invalidada on-write vía `platform:subscriptions*`)                         |
| `platform:gym-overview:{orgId}`            | 5 min  | Adopción gym + portal por org (sin invalidación cruzada desde writes del gym)                     |
| `platform:receipts:*`                      | 5 min  | Auditoría del correlativo `FS-N` (Console); clave por filtros, invalidada on-write en cualquier write de suscripciones/pagos (emisión/anulación) |
| `platform:staff*`                          | 5 min  | Platform staff (SaaS admins: support/admin/owner)                                                 |

### Cache Invalidation Strategy

- **On writes (POST/PUT/DELETE)**: Invalidate related cache patterns immediately — e.g., creating a subscription invalidates `platform:subscriptions*`, `platform:subscriptions:stats`, and `org:${orgId}:subscription-status`. Low-frequency data (plans, settings, payment-methods) uses 1 h TTL as a safety net: real invalidation is always on-write.
- **Dashboard invalidations**: member/subscription/payment writes invalidate `org:{orgId}:dashboard:stats:*` and `org:{orgId}:dashboard:action-items` (KPIs and actionable lists).
- **Role invalidation**: `afterUpdateMemberRole` hook in Better Auth invalidates `member:role:${userId}:${orgId}` so role changes take effect instantly
- **Graceful degradation**: All cache methods wrap errors with `console.error` and return `null`/void — Redis being down never blocks requests

---

## Background Jobs (Cloudflare Queues)

Emails and PDF generation are processed **asynchronously** via Cloudflare Queues: the `api-worker` produces events in the `TASK_QUEUE` binding (`fit-task-events`, DLQ `fit-task-events-dlq`) and `apps/jobs-worker` consumes them.

**Event contract** (`FitTaskEvent` — `apps/jobs-worker/src/index.ts`):

| Type                         | Payload                                                  | Producer                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email.registration_invite`  | `{ email, token, target?: 'panel' \| 'console', role? }` | `members.service.ts` (invite member without account → panel) + `/api/platform/staff` (console invitations)                                                                                                 |
| `email.org_invite`           | `{ email, orgName, inviterName, inviteLink }`            | Better Auth `sendInvitationEmail` hook in `lib/auth.ts` (invite a member with an account)                                                                                                                  |
| `email.payment_receipt`      | `{ paymentId, organizationId }`                          | `subscriptions.service.ts` — automatic: when creating a sub with `validated` payment and when approving a `processing` payment (PATCH status); also in manual resend (`POST /api/payments/:id/send-email`) |
| `email.org_payment_received` | `{ paymentId, organizationId, payerEmail?, payerName? }` | `organizations.route.ts` (POST `/subscription/renew` — self-service renewal, processing, payer+owners) + paso 2 platform (PDF listo, payer desde DB u owners-only) + resend manual |

**Handlers** (`apps/jobs-worker/src/handlers/`):

- `email.handler.ts` — email TRANSPORT ONLY (**Resend** with `EMAIL_PROVIDER=resend` or **Gmail SMTP** with `EMAIL_PROVIDER=gmail` + `SMTP_USER`/`SMTP_PASS`); the HTML is composed by the templates.
- `pdf.handler.ts` — payment receipts (gym membership + org SaaS payment confirmation).

**Templates** (`apps/jobs-worker/src/templates/`) — the HTML lives here, never in the handlers:

- `layout.ts` — base shells: `renderDarkShell` (invitations, dark background) and `renderLightShell` (receipts, yellow-receipt style) + `escapeHtml`.
- `send-invitation.ts`, `org-invite.ts`, `payment-receipt.ts`, `org-payment-received.ts` — each exports `renderX(data): { subject, html }`.

**Env vars (jobs-worker)**: `DATABASE_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_USER`, `SMTP_PASS`, `PANEL_URL`, `CONSOLE_URL`.

> **Rule**: never couple api-worker to synchronous email/PDF sends — always enqueue in `TASK_QUEUE` and let jobs-worker process it.

> **Receipts queue (`fit-receipt-events`)**: dedicated queue, own DLQ, **single consumer = jobs-worker**. `api-worker` is only a producer (step 1 + manual issue + re-enqueues); jobs-worker consumes **two** queues (`fit-task-events` emails + `fit-receipt-events` render) and branches `queue()` by `batch.queue`. Consumer + cron are owned by **Terraform** (`cloudflare_queue_consumer` ×2 + `cloudflare_workers_cron_trigger` in `workers.tf`); `wrangler.jsonc` declares only producers. Sweep cron runs **every 10 hours in pre-sale** (`0 */10 * * *`; revert to `*/10 * * * *` with real customers — see `docs/PENDING.md`). The render lives in `apps/jobs-worker/src/receipt-pdf.tsx` (lazy `@react-pdf/renderer`) — **api-worker must never depend on `@react-pdf/renderer`**. Shared receipt data access lives in `packages/database/src/repositories/receipts.repository.ts` (see §1 exception): atomic numbering + `getReceiptComposedData` + `completeReceiptPdf`/`markReceiptNotified`. The receipt email is gated by `markReceiptNotified` (with `clearReceiptNotified` rollback on send failure) so a transient queue error never loses the email — and that gate is exactly why the sweep can safely re-enqueue both pending states (C6).

---

## Payment Receipts (Panel + Console)

Panel receipts are internal payment records — never fiscal invoices (see `docs/ORGANIZATION_RECEIPT_MODEL.md`). Source of truth for frozen decisions: `plan.md`; module map: `tasks/README.md`.

- **Two-step emission**: step 1 assigns the number atomically (single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, per-org yearly sequence `{slug}-año-n`) in the validating request; step 2 renders the PDF in `jobs-worker` (`fit-receipt-events` queue + DLQ, sweep cron 10 h pre-sale) and `PUT`s it to R2 (`receipts/<org>/<año>/<n>.pdf`, immutable, generated once).
- **Email only from step 2**, after `UPDATE … WHERE receipt_pdf_key IS NULL RETURNING` (`rowCount === 1` gate); `markReceiptNotified` with `clearReceiptNotified` rollback on send failure.
- **Sweep covers three states (C6 + B2)** (`sweepPendingReceiptPdfs`, `jobs-worker`): *numbered without PDF* (≥15 min — the render was lost), *PDF ready but unnotified* (≥30 min — the step-2 email never left) **and** *voided without the sealed PDF* (≥15 min — the void was persisted but the ANULADO render never landed). All three are safe to re-enqueue because each artifact has its own idempotent gate; a corrupt row never aborts the rest.
- **Explicit void outcome (C6)**: `markReceiptVoided` throws `RECEIPT_NOT_ISSUED` as an **internal service contract**, but `PATCH /api/payments/:id/status` (and its Console twin) answers **200** with `receiptVoided: boolean` + `receiptVoidReason: 'not_issued'` when there was no receipt to void — the status change is never reverted and the panel/console show a differentiated toast. Never text-match; the code is the contract.
- **ANULADO es un artefacto, no solo un flag (B2)**: anular conserva el PDF de emisión **intacto** (write-once) y materializa uno **nuevo** con el sello (`<numero>-anulado.pdf`, columna `receipt_voided_pdf_key`). El original **deja de entregarse** en cuanto `receipt_voided` es true: hasta que exista el PDF con sello, el contrato responde `pending` (202 + `/receipt/pdf` 404) — *fail-closed*: un comprobante anulado nunca viaja sin su sello. Anular encola el render (paso 1-bis) y el tercer predicado del barrido es el backstop. Tampoco se reenvía por email: **409 `RECEIPT_VOIDED`** (el correo saldría con el PDF sin sello), aunque el evento ya en vuelo también se descarta en el handler.
- **Contract**: `GET /:id/receipt` → 200 ready / 202 pending / 200 `available:false,reason:pre_system` (never 409); `GET /:id/receipt/pdf` binary download; `POST /:id/issue` manual fallback (owner/manager).
- **Invariante validado ⇔ numerado (B1)**: la emisión se decide por el estado **persistido** (`createdPayment.status`), nunca por el payload — `payment.status` es opcional en el contrato y el repo lo normaliza a `validated`, así que decidir por el payload dejaba un pago validado **sin** número, sin render y sin email (y el PATCH a `validated` no lo repara: `wasPending` ya es false; solo `POST /:id/issue`).
- **Document gate** forces `"Comprobante de pago"` (`HAS_FISCAL_HOMOLOGATION=false` by construction); the technical UUID is never shown (only `receiptNumber`); voided = `ANULADO`, the number is never released or reused; serial audit at `GET /api/reports/receipts` (rows + per-currency totals + `gaps[]` = `1..lastNumber` per org/year).
- **Fiscal gating (C2, fail-closed)**: a receipt **never details taxes the emitter did not declare**. Without `fiscalConfig.isFormalTaxpayer: true` (declared with `confirmed: true` friction) the country taxes are born **off** and the receipt persists only the total (`subtotal = amountPaid`, `taxTotal = 0`, `taxDetails = []`). Enabling a tax without the declaration → **400 `TAXES_REQUIRE_FORMAL_TAXPAYER`**; conditional taxes (`basis: 'gross_first'`, e.g. IGTF VE) are born off, are never automatic, and require an explicit rate + `confirmedTaxes: ['IGTF']` → **400 `TAX_REQUIRES_CONFIRMATION`**. Validated on the **merged** config (not the incoming body) in `organizations.service` + defensive normalization in `resolveFiscalProfile`. The manual payment override can only **reduce** tax load: detailing taxes while informal → 400. `gross_first` taxes are extracted from the gross total **before** decomposing the rest (it changes the IVA base — the UI warns). Panel: `settings/organization` → Facturación; the platform emitter (FitStack) is **not** declared formal, so SaaS `FS-N` receipts also carry no breakdown (see `docs/PENDING.md` §9).
- **Document fidelity (C3)**: the PDF/contract **omit** lines without data (tax id, address, recipient document) — never filled with placeholders (`---`); `checklistPrePdf` rejects a visible placeholder (omitting is the correct path). If `currencyPaid ≠ baseCurrency` it prints `1 {base} = {rate} {paid}` **plus** the base-currency equivalent (`amounts.baseTotal`, derived with `roundCents` from the **persisted** rate — never from an exchange API).
- **Emitter snapshot (C1)**: step 1 persists `emitterSnapshot` (jsonb) **in the same statement as the number** — `version`, frozen `emitter` (name/legalName/taxId/taxLabel/address/countryCode/currency), the label applied by the gate, the recipient `docLabel`, the `disclaimer`, the `timezone` used to print dates and the resolved fiscal profile (`taxes[]` = name/rate/enabled). The compose reads the snapshot **first and skips live config entirely** (`resolveFiscalProfile` is not even evaluated), so `GET /:id/receipt` is reproducible after the emitter edits its profile. `NULL` = emitted before C1 → composed live (terminal, documented state); a present-but-invalid snapshot **throws** (never silently degrades).
- **Emission traceability (C5)**: `issuedBy` (actor of the numbering request) travels from the session (`c.get('user')?.id`) through `subscriptions.service` / `payments.route` / `platform-subscriptions.*` into `attach*Receipt`. Step 2 and the sweep never number, so they never write it: an existing `issued_by` is never overwritten or invented (`NULL` = historical/automatic emission). Both reports expose `issuedBy` + `emitterName` (from the snapshot) and the CSV export includes them.
- Shared-repo exception (§1): `packages/database/src/repositories/receipts.repository.ts` + `platform-receipts.repository.ts` — the only shared repos (two runtimes need identical SQL each).

> Columns (C1/C5): `payment.emitter_snapshot` / `payment.issued_by` and their twins on `platform_subscription_payment` — migration `0016`, additive nullable, no backfill (`NULL` = pre-C1 emission).

> Columns (B2): `receipt_voided_pdf_key` on `payment` and `platform_subscription_payment` + `idx_payment_voided_pending` / `idx_psp_voided_pending` (parciales del 3.er predicado) and the gym `payment.plan_snapshot_duration_value` / `plan_snapshot_duration_unit` — migration `0018`, additive nullable, no backfill (`NULL` = anulado anterior a B2 → lo recupera el barrido; duración sin snapshot → el cálculo cae al plan vivo).

> Payment-status migration (`0017`, additive/backward-compatible): sets `platform_subscription_payment.status` default to `'processing'` and normalizes legacy data (`pending → processing`, `invalid → voided`, marking `receipt_voided`/`voided_at`/`void_reason` when a receipt existed). Applied by CI (`database-migrations.yml`) on merge. After merge, no row may carry `pending`/`invalid`.

**Console (SaaS) receipts** mirror the same guarantees with one legal emitter (FitStack):
- Global continuous sequence `FS-N` (no year reset) + same two steps on the same `fit-receipt-events` queue (`scope:'platform'`); R2 keys `platform/receipts/<año-UTC>/FS-<n>.pdf`; sweep covers both tables.
- Same 3-state contract at `GET /api/platform/subscriptions/payments/:id/receipt` (+ `/receipt/pdf` binary, `POST /resend` with the 4 frozen branches); reads allow `subscription:list` (support downloads), writes require `organization:create` (support 403).
- Trial/free $0 never burn the series (`available:false,reason:pre_system`); payer persisted only at `processing` creation, validation never overwrites; year/period in UTC (platform billing convention).
- Voided SaaS payments keep number + PDF and set the ANULADO flag (`markPlatformReceiptVoided` on status →VOIDED, fixed reason, `by` required fail-closed); without a number the service code is `RECEIPT_NOT_ISSUED` but the endpoint answers **200** with `receiptVoided: false` + `receiptVoidReason: 'not_issued'` (C6); voiding never cancels the subscription nor reverts the cumulative period; `refunded` (reserved, no flow produces it) doesn't touch the flag and `voided` is the only annulment state (`rejected`/`annulled` is derived with `getVoidKind`). Same B2 rule as the Panel: the ANULADO PDF is a separate artifact (`platform/receipts/<año-UTC>/FS-<n>-anulado.pdf`), the emission PDF stops being delivered while it is missing and `POST /resend` answers **409 `RECEIPT_VOIDED`**.
- Emitter identity in `platform_setting` (`fitstack_*`, console Settings → Emisor); empty = generic "FitStack" + gate Comprobante.
- **Audit parity (C4)**: the audit of the global series lives at `GET /api/platform/subscriptions/receipts` + `/subscriptions/receipts` (console page with URL filters + CSV export up to 1000 rows), mirroring the Panel. Same `computeReceiptGaps` algorithm with an **injected strategy** (Panel: `{slug}-{año}-{seq}` annual; Console: `FS-{seq}` continuous, no year) → `gaps[]` classifies `hueco` vs `anulado` identically on both sides. Console filters run in **UTC** (platform billing convention); `year` there means the UTC year of `payment_date`, not a sequence universe. `support` reads (200); writes stay 403.

---

## Platform Subscription Status (Organization Billing)

Subscription status is **computed dynamically** via SQL CASE — NOT stored in DB.

**Constants** (`@workspace/shared/constants`):

```ts
PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active", // periodEnd >= now and EXISTS(validated|refunded)
  TRIAL: "trial", // isTrial && periodEnd >= now
  PAST_DUE: "past_due", // 1-7 days overdue
  READ_ONLY: "read_only", // 8-14 days overdue
  SUSPENDED: "suspended", // 15+ days overdue
  CANCELLED: "cancelled", // cancelledAt != null
};
```

The payment enum (`PAYMENT_STATUSES = processing | validated | voided | refunded`) and its derived helpers live in `@workspace/shared/constants`: `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) and `getVoidKind` (`voided` without `receiptNumber` → `rejected`; with → `annulled`). `pending` and `invalid` no longer exist.

**Computation** (`platform-subscriptions.repository.ts` — SQL CASE, order matters; pure mirror `computePlatformSubscriptionStatus`, parity-tested):

- `cancelledAt IS NOT NULL` → `cancelled`
- `isTrial = true` and active period → `trial`
- Active period + **`EXISTS(validated|refunded)`** (`QUALIFYING_PAYMENT_STATUSES`, never "the last payment") → `active`
- Active period without a qualifying payment (`processing`/`voided`/none) → `past_due`
- Grace from `currentPeriodEnd` (using `FLOOR` to match the pure helper): overdue ≤ 7 days → `past_due`; ≤ 14 → `read_only`; > 14 → `suspended`

`computePlatformSubscriptionStatus` (pure mirror) now requires **`hasValidatedPayment: boolean`** (no longer optional). The SQL and the helper are parity-tested (`platform-subscription-status.test.ts`).

A `voided` payment is **ignored**: it never revokes service; grace runs from `currentPeriodEnd` and the tiers do **not** accumulate. `processing` does not qualify either. `getLastSubscriptionStatus(organizationId)` exposes this same status + `hasValidatedPayment` for the self-service renewal guard, which blocks a re-payment **only if `currentPeriodEnd > now && hasValidatedPayment`** (a client whose only payment was voided can pay again). When the status does not grant access, the free-tier gate decides (`features.service.ts`): if `feature_flags_free_tier_enabled === 'true'` the free floor applies; otherwise the legacy gate sends the panel to `/no-subscription` (see "Features & Free Tier").

> Careful: the gym `subscription` table (`subscriptions.repository.ts`) has its own derived status (`getSubscriptionStatusSql`): a `voided` payment → **`voided` (ANULADA)** and it wins over `cancelledAt`; `cancelledAt` alone → `cancelled` (revocada); `endDate < now` → `expired`. `cancelledAt` remains the internal "out of force" flag used by reports/actives. This is **not** the `platform_subscription` rule.

**Validation flow** (`apps/panel/app/dashboard/layout.tsx`):

- `SUSPENDED` / `CANCELLED` → redirect to `/no-subscription`
- `PAST_DUE` / `READ_ONLY` → show `<SubscriptionWarningBanner />`
- `ACTIVE` / `TRIAL` → normal render

**Endpoint**: `GET /api/organizations/subscription-status` (reads org from session) — fetch wrapped in `getOrgSubscriptionStatus(activeOrgId)` (`apps/panel/lib/services/subscription-status.ts`), used by the layout and by the gate page.

**Dynamic gate pages** (`/no-subscription`, `/unauthorized` in panel and console) — Server Components with `force-dynamic` that check the session on every request: no session → `redirect('/login')`; valid access (active subscription or allowed role) → `redirect('/dashboard')`; only without access they render. Prevents getting stuck after logout or refresh.

- **Note**: The `/no-subscription` page is OUTSIDE `/dashboard` layout to prevent infinite redirect loops.

### Self-service renewal (phase 2 — org pays from the panel)

Flow: the org renews its SaaS subscription from `apps/panel/app/(protected)/settings/suscription` → the payment stays `processing` ("under review") → support approves/rejects it in console (badge "Pago pendiente" in the subscriptions table + `PlatformPaymentHistoryModal` which now renders `paymentMethodDetails` with `PaymentDetailsList`, incl. "VER CAPTURA" links to R2) → once validated, the period is extended automatically.

- **`POST /api/organizations/subscription/renew`** (`requireOrgPermission('organization','update')` — owner/manager): **minimal body** `{ paymentMethod, currencyPaid, paymentMethodDetails?, paymentDate? }`. Everything financial is dictated by the backend — **the body can never hardcode amounts or rates**:
  - Snapshot (`planSnapshot*` + `featuresSnapshot`) ← from the plan in DB.
  - Rate ← `createExchangeRateProvider` (`api-worker/src/lib/exchange-rates.ts`, open.er-api.com, cache `rates:{base}` 1h; `EXCHANGE_API_URL` override for tests). `rate = 1` if currency == plan currency; provider failure → 503.
  - `amountPaid = round((priceOverride ?? plan.price) × rate)`, `baseAmount = effective price`, `exchangeRateApplied = String(rate)`.
  - `status = processing` (forced) — does NOT extend the period (only `PATCH status VALIDATED` does).
  - Guards: 400 without active org · 404 without sub · 400 cancelled · 409 if `hasPendingPayment` · **409 if `currentPeriodEnd > now` AND `hasValidatedPayment`** (a client with an un-paid/voided period can pay again).
  - Invalidates `platform:subscriptions*` + `org:${orgId}:subscription` / `subscription-status` / `features`.
- **Org-scoped reads**: `GET /api/organizations/subscription` (active sub with plan, `findActiveByOrganization`), `GET /api/organizations/payment-methods` (platform methods + currencies + currencyFormat). Services in `apps/panel/lib/services/org-billing.ts`; UI in `apps/panel/components/billing/` (`SubscriptionStatusCard` + `OrgRenewalModal` + `OrgPaymentSection`).
- **Field pre-sorting**: `visual` fields (instructions) are rendered first in all payment forms via `sortPaymentMethodFields` (`@workspace/shared`).

---

## Features & Free Tier (SaaS Plan Feature-Flags)

Platform SaaS plans are described with **features (feature-flags)** instead of loose booleans. Single source of truth in code: `packages/shared/src/features/catalog.ts` (re-exported by `@workspace/shared`).

### Catalog (`FEATURE_CATALOG`, version `FEATURE_CATALOG_VERSION`)

| Feature          | kind    | Limits               | Notes                                  |
| ---------------- | ------- | -------------------- | -------------------------------------- |
| `panel`          | boolean | —                    | `alwaysOn` (cannot be disabled)        |
| `cms`            | boolean | —                    | Content/pages                          |
| `blog`           | boolean | —                    | Blog                                   |
| `members_portal` | boolean | `member_seats`       | Member Portal (seats)                  |
| `ai_chat`        | boolean | `ai_credits_monthly` | AI Chat (credits/month; 0 = unlimited) |

Extension rules: every new feature is born `defaultEnabled: false` (additive); `normalizeFeatures` ignores unknown IDs and sanitizes types (numeric limits, 0 = unlimited); `resolveFeatures(null)` → catalog defaults.

### Free Tier (free floor)

- **Explicit, NOT a plan**: configured in `platform_setting` with 2 keys — `feature_flags_free_tier` (JSON of `PlanFeaturesV2`) and `feature_flags_free_tier_enabled` (`"true"`/`"false"`, activation flag) — edited from console → Settings → **Free Plan** (`apps/console/app/dashboard/settings/free-tier/`). There is no `is_free`; plans with `price = 0` are normal trials. The resolver ignores the setting if `feature_flags_free_tier_enabled !== 'true'`.
- **Code defaults** (`FREE_TIER_FEATURES`): `panel` + `members_portal` (10 seats) + `ai_chat` (500 credits/month). Overridable from console.
- **Resolution rule** (`features.service.ts → getOrgFeatures`):
  - Sub `ACTIVE`/`TRIAL` → plan features (with `planId`/`planName`).
  - Sub `PAST_DUE`/`READ_ONLY`/`SUSPENDED`/`CANCELLED` **or no sub** + free tier **enabled** (`enabled === 'true'`) → free floor (`isFreeTier: true`).
  - No free tier enabled → legacy behavior (`past_due`/`read_only` banner, `suspended`/`cancelled` blocking).

### Enforcement (downgrade = hide)

- **Middleware** `requireFeature(featureId)` in `apps/api-worker/src/lib/route-handler.ts` → 403 `{ code: 'FEATURE_NOT_AVAILABLE' }` if the feature is not enabled. Applied after `requireOrgPermission`.
- **Gated routes**: `/api/cms/*` → `cms`; `/api/ai/chat` → `ai_chat` (plus monthly credit quota, see below).
- **Portal seats** (`members_portal.member_seats`): `GET /api/organizations/seats` → `{ used, limit, pending }` (used = active gym_members with `userId`; pending = Better Auth `pending` invitations). Guard in `members.route.ts` (POST `/api/members` with `sendInvite` and role `member`, and in `link-user`) → 403 `FEATURE_LIMIT_REACHED` if `limit > 0` and `used + pending >= limit`. `limit 0` = unlimited.
- **Frontend**: `OrgFeaturesProvider` + `filterNavItemsByFeatures` hide sidebar items; guards in `/dashboard/content` and `/dashboard/chat`; `ai-quota-banner` and `portal-seats-banner`.

### AI Credits (`ai_chat`)

- **Unit**: 1 credit = 1K tokens (x1.0, see `shared/ai.ts` `AI_CREDIT_CONSTANTS`). Default provider in `platform_setting` `ai_provider_default` (`openrouter` | `workers-ai`, default `openrouter`, automatic fallback to the other). Docs: `docs/CHAT_PRICING.md`, `docs/CHAT_INFRASTRUCTURE.md`.
- **Limits**: `ai_chat.limits.ai_credits_monthly` per plan (configurable in admins, not hardcoded) + free tier `FREE_TIER_FEATURES` (500/month). Catalog in `shared/features/catalog.ts`.
- **Balance limits**: `AI_CHAT_LIMITS` in `shared/ai.ts` (`maxUserMessageChars: 500`, `maxHistoryMessageChars: 2_000`, `maxInputChars: 8_000`, `maxOutputTokens: 800` normal / `maxToolOutputTokens: 2_048` for tool, `maxHistoryMessages: 10`). Zod and `ai.service` clamp `max_tokens`. The system prompt is composed server-side — the client never sends role `system`.
- **Source of truth**: `ai_usage` table — row per `(organization_id, period_type='monthly', periodStart)` with `credits`, atomic upsert. `periodStart` = subscription cycle if ACTIVE/TRIAL, otherwise calendar day 1 (lazy reset, no cron). Index `idx_ai_usage_org_period`.
- **Accounting**: `consumeAiCredits(estimated)` (pre-flight) + `settleAiCredits(actual)` post-stream via `ctx.waitUntil` (DB is source of truth). Compat `consumeAiMessage` (3 credits) for tests. `cache.increment` exists but is unused.
- **RAG (Knowledge Base)**: automatic retrieval pre-generation in `/api/ai/chat`. Config in `RAG_CONFIG` (`shared/ai.ts`: topK 4, minSimilarity 0.35, chunkSizeChars 800, overlap 100, maxContextChars 2_000). Embeddings ALWAYS Workers AI `@cf/baai/bge-m3` (1024 dims, multilingual) via `aiService.embed()` — independent of the chat provider. System prompt = `PANEL_SYSTEM_PROMPT` (`shared/prompts.ts`) + `[Contexto]` block; RAG failure never breaks chat. KB admin: Console → Settings → Knowledge Base (`/api/platform/knowledge`, tables `ai_knowledge_document`/`ai_knowledge_chunk`, pgvector HNSW; `organization_id NULL` = platform, set = org doc with isolation in SQL). Phase 2: panel org-KB + function calling (live data).
- `GET /api/ai/usage` → `{ monthly: { used, limit }, remaining, disabled, periodStart }`. `POST /api/ai/chat` estimates credits (+ chars of the composed prompt + `RAG_CONFIG.maxContextChars` cap), validates balance, does openrouter→glm fallback and settles `creditsFromUsage(usage)`; headers `X-Ai-Credits-Used/Limit/Remaining`; if exhausted → 429 `{ code: 'AI_QUOTA_EXCEEDED', limits }`. `limit 0` = unlimited.

### Feature snapshot in payments

Every platform payment (`platform_subscription_payment`) stores `features_snapshot` (JSON of `PlanFeaturesV2`) when creating a subscription, renewing, changing plan and recording payment — to compare "features at payment time" vs "plan today" (`summarizeFeatures` in console). Cache invalidation: `org:${orgId}:features` on subscription, plan and platform settings writes.

### Endpoints

| Endpoint                          | Auth                  | Use                                                       |
| --------------------------------- | --------------------- | --------------------------------------------------------- |
| `GET /api/platform/features`      | `requirePlatformAuth` | Catalog (console)                                         |
| `/api/platform/knowledge`         | `requirePlatformAuth` | AI Knowledge Base CRUD (platform docs, bge-m3 embeddings) |
| `GET /api/organizations/features` | `requireAuth`         | Resolved features + `isFreeTier` + status (panel gate)    |
| `GET /api/organizations/seats`    | `requireAuth`         | Portal seats                                              |
| `GET /api/ai/usage`               | `requireAuth`         | AI quotas                                                 |

---

## Role-Based Access Control (RBAC)

Fit-Stack uses **two levels of roles**: Platform (SaaS) and Organization (tenant).

### Platform Roles

Platform roles for Better Auth admin plugin (`platformRoles` in `packages/shared/src/access-control.ts`): `owner`, `admin`, `support` (+ `user` as Better Auth default, no role in `platformRoles`). The `user.role` field stores this platform role.

**Console access gate**: `canAccessConsole(role)` (`@workspace/shared`) — `true` only for roles with `organization.create` (admin/owner); `support` is read-only and doesn't enter the console layout.

### Organization Roles

```ts
ORG_ROLES = {
  OWNER: "owner", // Super Admin / Creator — total control
  MANAGER: "manager", // Gym Owner/Manager — full tenant control
  CASHIER: "cashier", // Staff/Cashier — payments and check-ins
  COACH: "coach", // Trainer — routines and athlete progress
  MEMBER: "member", // Gym client — app access to their own data
};
```

### Permission Matrix

**Source of truth**: `packages/shared/src/access-control.ts` — `organizationStatement` + `organizationAc.newRole(...)` (Better Auth Access Control). Helpers in `packages/shared/src/permissions/` expose the matrix through `can(role, module, action)`.

| Module            |  Owner  |    Manager     |    Cashier     |         Coach         | Member  |
| ----------------- | :-----: | :------------: | :------------: | :-------------------: | :-----: |
| **Panel**         |   ✅    |       ✅       |       ✅       |          ❌           |   ❌    |
| **Dashboard**     |   ✅    |       ✅       |       ✅       |          ❌           |   ❌    |
| **Reports**       |   ✅    |       ✅       |       ✅       |          ❌           |   ❌    |
| **Members**       | ✅ CRUD | ✅ (no delete) | ✅ (no delete) |          ❌           |   ❌    |
| **Staff**         | ✅ CRUD | ✅ (no delete) |       ❌       |          ❌           |   ❌    |
| **Subscriptions** | ✅ (no delete) | ✅ (no delete) | ✅ (no delete) |          ❌           |   ❌    |
| **Plans**         | ✅ CRUD | ✅ (no delete) |    ✅ read     |        ✅ read        | ✅ read |
| **Classes**       | ✅ CRUD | ✅ (no delete) | ✅ (no delete) | ✅ (no create/delete) | ✅ read |
| **Content**       | ✅ CRUD | ✅ (no delete) |       ❌       |        ✅ read        | ✅ read |
| **Settings**      | ✅ r+w  |     ✅ r+w     |    ✅ read     |          ❌           |   ❌    |
| **Organization**  | ✅ r+w  |     ✅ r+w     |       ❌       |          ❌           |   ❌    |
| **AI (Chat)**     | ✅ read |    ✅ read     |    ✅ read     |          ❌           |   ❌    |

### How to Verify Permissions

**In API routes (api-worker)**: Use `requireOrgPermission` / `requirePlatformPermission` middleware from `apps/api-worker/src/lib/route-handler.ts`

```ts
import { requireOrgPermission } from '../lib/route-handler'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'

.get('/', requireOrgPermission(PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.READ), async (c) => { ... })
```

**In UI (client-side)**: Use `useAuth()` and `usePermissions()` from `@workspace/auth/hooks`

```tsx
import { useAuth, usePermissions } from "@workspace/auth/hooks";
const { isOwner, isManager, isCashier, isCoach, isMember, orgRole } = useAuth();
const { can } = usePermissions();
const canEditClasses = can(
  PERMISSION_MODULES.CLASSES,
  PERMISSION_ACTIONS.UPDATE,
);
```

### Anti-escalation

Use `canAssignRole(actor, target)` from `@workspace/shared` (`packages/shared/src/permissions/role-assignment.ts`) to prevent role escalation:

- `OWNER` → can assign any role
- `MANAGER` → cannot assign `OWNER`
- `CASHIER` → can only assign `MEMBER`

**Platform anti-escalation** (`canAssignPlatformRole(actor, target)`):

- `owner` → can assign any platform role (support/admin/owner)
- `admin` → only `support` or `admin` (NEVER `owner`)
- `support` → cannot assign

> Anti-escalation is validated **server-side** in `/api/platform/staff` (POST and DELETE) — the UI only filters options.

### Panel Access Control

Only `OWNER`, `MANAGER`, `CASHIER` can use the panel app (`apps/panel`). Implemented via the `panel: ["access"]` permission (`PANEL` module, `ACCESS` action):

```ts
import { usePermissions } from "@workspace/auth/hooks";
const { canAccessCms } = usePermissions(); // equivalent to can(PANEL, ACCESS)
if (orgRole && !canAccessCms()) redirect("/unauthorized");
```

### Security Rules

1. **Never trust client-side role checks** — Always re-verify in API
2. **Session-based authorization** — Use `session.member.role` from Better Auth
3. **Organization scoping** — All queries MUST filter by `organizationId`
4. **No platform admin bypass in CMS** — Platform roles are for SaaS platform management only
5. **Uploads: dos rutas, una sola autoridad por caso** — El panel sube por `/api/upload/*` con la org de **su propia sesión** (`requireOrgPermission(MEMBERS, CREATE)`): `organizationId` no existe en el contrato, así que ningún miembro puede escribir en la carpeta de otro gimnasio. El console (que NO tiene org activa) sube por `/api/platform/organizations/:orgId/upload/*` con la org por **path** y `requirePlatformAuth` (admin/owner; `support` → 403) o por `/api/platform/upload/*` para branding. Toda key escrita/borrada debe empezar por `<orgId>/` (o `platform/branding/`); la lectura pública vive en `/api/public/files/*` y solo sirve `<orgId>/cms/…` y `platform/branding/…`.

---

## Shared Package Exports (`packages/shared`)

```ts
// Entry point: @workspace/shared
// Re-exports: constants, types, access-control, auth-config, permissions

// constants.ts
ORG_ROLES, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES,
PLATFORM_SUBSCRIPTION_STATUSES, COUNTRIES (8 countries: VE/CO/MX/AR/CL/PE/ES/US),
COUNTRY_LIST, COUNTRY_INDEX (`indexCountries()` — derived codes, currencies, timezones and timezoneOptions; single source for iterations), DEFAULT_COUNTRY, ICountryConfig,
ORG_ROLE_LABELS + formatOrgRole (organization/Panel roles),
PLATFORM_ROLE_LABELS + formatPlatformRole (platform/Console roles: owner, admin, support, user)

// types.ts
IUser, ISession, IAuthMember, IOrganization, ICmsClass, IMember, MemberFilter,
PaginatedMembers, IAuthError, TrendDirection, FrequencyType, PlanFeatures, IPlatformOrganization,
IPlatformSubscription (incl. `organizationSlug?` — joined from the org, used for slug-based detail routes),
IPaymentMethodConfig, IPaymentMethodField (type: 'text' | 'file' | 'number' | 'visual' + value?)

> **`visual` field in payment methods**: a field with `type: 'visual'` stores instructions
> in `value` (e.g. "Método de pago: Binance\nEnviar a: ...") that the payment-methods editor
> writes with a `Textarea`. In payment forms (`payment-section.tsx` in panel and console)
> it renders as an **info card** (`whitespace-pre-line`), never as input, never
> `required`, and **is not persisted** in `paymentMethodDetails` (forms filter it when
> building details — `subscription-form.tsx` / `platform-subscription-form.tsx`).
> `paymentMethodDetailsSchema` (api-worker) remains `text|file|number`.

// access-control.ts
platformStatement/platformAc/platformRoles (owner, admin, support),
organizationStatement/organizationAc/organizationRoles (owner/manager/cashier/coach/member),
orgRoleDefinitions, canAccessConsole(role), PlatformStatement, OrganizationStatement,
OrgRole/PlatformRole/OrganizationRole types. Re-exports PERMISSION_MODULES and PERMISSION_ACTIONS.

// auth-config.ts
ORGANIZATION_ADDITIONAL_FIELDS (slogan, countryCode*, taxId, legalName, address, fiscalConfig, timezone*, primaryCurrency*, currencyFormat* — *required)

// permissions/
  modules.ts:         PERMISSION_MODULES (12 modules: dashboard, reports, members, staff,
                      subscriptions, plans, classes, content, settings, organization, ai, panel)
  actions.ts:         PERMISSION_ACTIONS (READ, CREATE, UPDATE, DELETE, ACCESS)
  can.ts:             can(role, module, action), canAny(), hasAccess (alias of can)
  role-assignment.ts: canAssignRole(actor, target) (org) and canAssignPlatformRole(actor, target) (platform)

// ai.ts
AI_MODEL_IDS, OPENROUTER_FREE_MODEL_IDS, ALL_CHAT_MODEL_IDS (allowlist — single source
of truth consumed by api-worker to validate/route provider and by panel for the
selector via RSC), AiProvider ("workers-ai" | "openrouter"), getAiProvider(modelId),
AI_MODELS, IAiChatMessage, IAiChatRequest, IAiSseEvent (chat SSE contract)

// content.ts
CMS module types and Zod schemas (single source of truth — api-worker validates and the
panel types forms with them): ContentBlockType, BLOCK_SCHEMAS (hero/services/classes/
testimonials/gallery/contact/team) + validateBlockData(), IContentPage, IContentBlock
(discriminated by blockType → block-typed data), IContentPageWithBlocks.
Requires `zod` as a dependency of @workspace/shared.
```

---

## Auth Package (`@workspace/auth`)

```ts
// Entry: @workspace/auth (re-exports client, service, hooks, permissions + shared constants)

// client.ts — createAuthClient with customSession + organization plugin
authClient, useSession, organization
Types: User, Session, SignInParams, SignUpParams

// service.ts — sessionService (works client & server)
sessionService.getSession(headers?) → { data: Session | null, error: IAuthError | null }
sessionService.getServerSession(headers) → { data, error }
sessionService.signIn({ email, password }) → { data, error }
sessionService.signUp({ email, password, name }) → { data, error }

// hooks.ts — "use client"
useAuth() → { session, user, activeOrganization, isAuthenticated, isPending, error, roleName,
              orgRole, isAdmin, isOwner, isManager, isCashier, isCoach, isMember, refetch }
usePermissions() → { orgRole, can(module, action), canAccessCms() }

// permissions.ts — checkAccess / canAccessCms built on PERMISSION_MODULES.PANEL + PERMISSION_ACTIONS.ACCESS
```

---

## Database Schema (33 tables)

### Better Auth Core

`user`, `session`, `account`, `verification`

### Organization & Membership

`organization` (includes: slogan, countryCode (**no DB default**, required at creation), timezone (**notNull**, no default), **primaryCurrency + currencyFormat (`notNull` columns without default — currency derives from country, format comes explicit; never read from settings)**)
`member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)

`platform_plan` (catalog with features as PlanFeatures, price in cents), `platform_subscription` (status computed in SQL — `status` column is legacy), `platform_subscription_payment` (invoices with commercial snapshots), `ai_usage` (AI credits: `credits` (consumption) + `bonus_credits` (one-off bonus per cycle, via **Dar AI Credits** in console) + `count` legacy, index `idx_ai_usage_org_period`, monthly period per cycle)

### Gym Domain

`gym_member` (local profiles, linked to user via userId), `coach_profile` (1:1 extension),
`coach_assignment` (coach ↔ client)

### Memberships & Payments

`membership_plan` (gym product catalog), `subscription` (member ↔ plan), `payment` (financial audit trail)

### Access Control

`access_control_log` (every access attempt: granted, denied, error), `biometric_sync_task` (device sync queue)

### AI / RAG

`ai_usage` (AI credits), `ai_knowledge_document` (KB docs; `organization_id NULL` = platform, set = org), `ai_knowledge_chunk` (chunks with pgvector 1024 dims embedding + HNSW cosine)

### Routines (Fitness)

`exercise`, `routine_template`, `routine_template_item`, `workout_session`, `workout_session_log`

### CMS & Web

`gym_class` (class schedule), `content_page` (includes `metaTitle`/`metaDescription` SEO; canonical derives from slug), `content_block` (blocks by type with display order)

### Settings

`platform_setting`, `gym_setting`

---

## Console API Layer (ofetch)

`apps/console` uses **ofetch** as the unified wrapper for native `fetch` (global rule: **no raw `fetch`** — see section 8 of Technical Standards). Replaces axios with a lighter API (~6kb) and native support for `next: { revalidate, tags }`.

### Structure

```
lib/
├── api/
│   ├── client.ts          ← ofetch.create() context-aware
│   ├── types.ts           ← ApiFetchOptions (extends FetchOptions + next)
│   └── exchange-rates.ts  ← external fetch (no auth)
├── services/              ← typed methods (reusable from RSC and client)
│   ├── organizations-service.ts
│   ├── platform-plans-service.ts
│   ├── platform-subscriptions-service.ts
│   ├── staff-service.ts (platform staff: getAll/create/revoke/validateToken/accept)
│   ├── currency-service.ts (legacy, use lib/api/exchange-rates in RSC)
│   ├── init-service.ts
│   ├── upload-service.ts
│   └── session-service.ts (uses authClient, unchanged)
└── hooks/                 ← vanilla hooks (no TanStack Query): use-auth, use-debounce,
                             use-exchange-rates, use-organization-activation, use-theme
```

### Context-aware behavior (`lib/api/client.ts`)

| Context              | Cookie handling                                                            | Interceptors                                                             |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Server (RSC)**     | Reads `cookies()` from `next/headers` and forwards them as `Cookie` header | No `window.location` (no-op)                                             |
| **Client (browser)** | `credentials: 'include'` (browser sends cookies automatically)             | `ORGANIZATION_NOT_FOUND` → `window.location.href = '/reset-org-context'` |

### Service usage pattern

```ts
import { api, type ApiFetchOptions } from "@/lib/api/client";

export const exampleService = {
  // RSC: pass { next: { revalidate, tags } } to cache
  async getAll(
    params?: { page?: number; limit?: number },
    options?: ApiFetchOptions,
  ) {
    return await api("/example", { query: params, ...options });
  },

  // Client: without options, ofetch doesn't cache
  async create(data: any) {
    return await api("/example", { method: "POST", body: data });
  },
};
```

### Post-mutation convention (invalidación + refetch por petición)

Every mutation from a client component (modal/form/table action) must run
all three steps **in this order** — neither one alone is enough:

```ts
// 1. Call the service (ofetch `api()` — the HTTP request)
// 2. Purge the Next cache tag via a server action (`updateTag`)
// 3. Re-fetch the RSC (`router.refresh()`)
```

```tsx
// RSC page — owns the server action (it alone can call `updateTag`):
import { updateTag } from "next/cache";

const refreshOrgs = async () => {
  "use server";
  updateTag("console:orgs");  // purges every fetch tagged `console:orgs`
};

return <OrganizationsResults organizations={...} onRefreshServer={refreshOrgs} />;
```

```tsx
// Client component — awaits the purge BEFORE refreshing:
const refresh = React.useCallback(async () => {
  if (onRefreshServer) {
    await onRefreshServer(); // without this, refresh() re-reads stale cache
  }
  router.refresh(); // without this, the purge never reaches the screen
}, [router, onRefreshServer]);
```

Why both: `router.refresh()` re-fetches the RSC but still hits fresh
(`revalidate`, `tags`) cache entries — without `updateTag` the screen shows
stale data until the TTL expires. `updateTag` without `refresh()` purges
silently without re-rendering. Panel uses the same shape
(`members-client.tsx` + `onRefreshServer` prop).

> **Listas accionables siempre frescas**: la lista "Por validar" de
> `/payments` se pide con `cache: 'no-store'` (`payments/page.tsx`). Una lista de
> trabajo no puede tener staleness: un pago registrado por otro canal debe
> aparecer al recargar, no al vencer un TTL. La tabla de suscripciones sí puede
> tolerar `revalidate: 60` + tag porque toda escritura de la app la purga.

> **Next.js 16 note**: `revalidateTag(tag, profile)` now requires a `profile` (string or `CacheLifeConfig`). For server actions use `updateTag(tag)` (new in Next 16, no profile).

### Console Cache Tags

| Tag                 | Endpoint                                         |
| ------------------- | ------------------------------------------------ |
| `console:orgs`      | `/api/platform/organizations*`                   |
| `console:plans`     | `/api/platform/plans*` (with-stats, summary)     |
| `console:subs`      | `/api/platform/subscriptions*` (includes /stats) |
| `console:settings`  | `/api/platform/settings`                         |
| `console:staff`     | `/api/platform/staff`                            |
| `console:knowledge` | `/api/platform/knowledge*`                       |
| `console:receipts`  | `/api/platform/subscriptions/receipts`           |

### RSC Pattern in `apps/console`

- **Pages are Server Components** (no `"use client"`) that call services directly with caching options.
- **Filters and pagination in URL** (`searchParams` is `Promise<...>` in Next 15+):
  ```tsx
  export default async function Page({
    searchParams,
  }: {
    searchParams: Promise<{ query?: string; page?: string }>;
  }) {
    const { query, page = "1" } = await searchParams;
    const result = await service.getAll({ query, page });
    // ...
  }
  ```
- **Client leaves** (search inputs, pagination buttons, modals) use `useRouter` + `searchParams` from `next/navigation` to modify the URL → server re-render.
- **Type C pages** (currencies, payment-methods) are already **RSC parent + client child with `initialData`**: the server fetches settings (`console:settings`) and the client starts with the data (no loading flash) and saves via `api POST` + server action `updateTag`. The `organizations/[id]/settings` page remains client (fetch with `useState`/`useEffect`, no TanStack Query).
- **TanStack Query is REMOVED from the project** (console and panel). Single standard: **RSC + ofetch + Next cache for all reads**; mutations in RSC pages use `service → toast → updateTag → refresh`. A client-side fetching library would only be reintroduced if a live-data feature (polling, optimistic UI, infinite scroll) justifies it.
- **Reusable module pattern** (dashboard/staff/subscriptions/organizations): pure selectors in `lib/platform/*-selectors.ts` (unit-tested) + permissions in `lib/platform-permissions.ts` + server-safe formatting in `lib/utils/value-converters.ts` (`formatCents`, `formatShortDate`); tables with `MAX_ITEMS=10` and URL filters; unique hooks → `data-testid`, repeated hooks → `class`.

### Settings constants

- `PLATFORM_SETTINGS_KEYS` → `apps/console/lib/config/platform-settings.ts` (platform settings)
- `SETTINGS_KEYS` → `apps/console/lib/config/settings.ts` (organization settings)

Both are imported from server and client (they don't depend on hooks).

---

## Testing

Fit-Stack has **3 test layers**.

### 1. `pnpm test` — Unit + Integration (Vitest)

Runs the Vitest suite across all packages/apps:

```bash
pnpm test  # shared → api-worker → jobs-worker → panel → console (Vitest)
```

**What it includes:**

- **Unit Tests (all packages/apps)**: pure functions, no DB or HTTP.
  - `packages/shared/tests/`: features catalog, RBAC permissions, constants, RAG helpers, date utils
  - `apps/api-worker/tests/unit/`: AI helpers (`ai-helpers.test.ts`)
  - `apps/panel/tests/unit/`: UI utilities (`helper.test.ts`, `display.test.ts`, `features.test.ts`, `error.test.ts`)
  - `apps/console/tests/unit/`: UI utilities (`helper.test.ts`, `display.test.ts`, `features.test.ts`) + pure selectors/permissions (`dashboard-selectors`, `subscription-selectors`, `organization-selectors`, `platform-permissions`, `paginate`, `staff-role-counts`)
- **Integration Tests (api-worker)**: real HTTP against the Hono app + Neon branch. `pnpm --filter api-worker test:integration`.
  - **Real HTTP, no mocks**: `app.fetch(request, env, ctx)` — the same production entry point — against a **Neon branch** (`TEST_DATABASE_URL` in `apps/api-worker/.dev.vars`; read `tests/setup.ts`).
  - **Hard guards**: refuses to run if `TEST_DATABASE_URL` points to the same host+db as `DATABASE_URL`; without `TEST_DATABASE_URL` the whole suite is skipped with `describe.skipIf` (CI included).
  - **Determinism**: `fileParallelism: false` (one shared branch), `TRUNCATE ... RESTART IDENTITY CASCADE` between files (`tests/helpers/db.ts`), Redis intentionally absent (no-op cache).
  - **Recording spies** for R2 and Queues (`tests/helpers/env.ts`) — can assert enqueued events (e.g. `email.payment_receipt`).
  - **Fixtures** (`tests/helpers/auth.ts`): sign-up/orgs via real HTTP (Better Auth), direct SQL insert only for what has no endpoint (global roles). **Shared per `describe`** (`beforeAll`) when assertions don't depend on mutated state (unique emails/keys) — each Better Auth sign-up costs ~3s (bcrypt + Neon), so one tenant per test only where isolation requires it.
  - **Auth guards** (`tests/integration/guards.test.ts`): cover the 3 middlewares of `route-handler.ts` — `requireAuth` (401 without session; lets a valid session without org through, 200 with `admin`), `requireOrgPermission` (401, **400 without active org**, role matrix: positive owner/manager/cashier settings, member/coach plans/classes read; negative coach settings, cashier staff, coach classes.create even with update, member subscriptions) and `requirePlatformPermission`/`requirePlatformAuth` (admin/owner 200, **support 403 read-only** in settings/orgs/staff, user 403, 401).
  - **Schema sync**: `pnpm --filter api-worker test:db:push` (drizzle-kit push against the test branch, never production).

> **panel/console have no integration tests** — their tests are unit only (`tests/unit/`). api-worker is the only one with an integration suite.

> E2E **don't** run with `pnpm test` — they are a separate layer (`pnpm test:e2e`).

### 2. E2E Tests (Playwright) — suite normal: solo tests, cero evidencias

End-user tests navigating the real UI in Chromium. Config in `playwright.config.ts` (root).
The suite creates its own tenant (`e2e-suite` + `e2e-empty`), tests the flows
(create/edit), and deletes everything on teardown — no residue. This is NOT demo
data: the demo org (`Fit Stack` / `fit-stack`) is filled by `pnpm seed:e2e` and
is never touched by the suite.

```bash
pnpm test:e2e           # All E2E tests (console first, then panel)
pnpm test:e2e:ui        # Playwright UI mode (visual debug)
pnpm test:e2e:panel     # Panel only (Gym Admin, + its login setup)
pnpm test:e2e:console   # Console only (SaaS Admin, + its login setup)
pnpm test:e2e:report    # Open HTML report
pnpm seed:e2e           # Demo seed: fills Fit Stack/fit-stack (NOT a test, keeps data)
```

**Suite coverage**: panel — auth, dashboard (KPIs + sidebar nav), members, plans, subscriptions, classes, settings, content (CMS), empty-state; console — auth, dashboard, organizations, subscriptions, staff, plans, settings.

**Lifecycle** (`global-setup.ts` → setups → specs → `global-teardown.ts`):

1. Reset (crash-safe, fixed slugs/emails): wipe `e2e-suite` + `e2e-empty` orgs + reserved users. Worst case is "suite orgs exist", never accumulation.
2. Platform owner (`e2e-platform@e2e.test`, role promoted via SQL).
3. Console creates the suite org via `POST /api/platform/organizations` (same path as prod) → provisions the panel owner via `POST /:id/staff` (role owner) → trial platform sub → minimal gym seed (1 plan, 3 members, 1 sub, 1 class, 1 CMS page). Same for the empty org `e2e-empty` (no gym seed, used by `empty-state.spec.ts`).
4. `console-setup` / `panel-setup` do UI login only + `storageState` (+ route prewarm).
5. Teardown wipes the suite orgs + users (best-effort; skipped with `E2E_KEEP_DATA=1` for inspection). The platform plan catalog row is shared and reused by name — never deleted (other orgs' subs reference it).

**Playwright config** (`playwright.config.ts`):

- `testDir: './e2e'`, `fullyParallel: false`, `workers: 1` (one shared dev DB + one suite org — parallel workers would write the same org), `timeout: 60_000`, `retries: 1` in CI.
- `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `expect.timeout: 15_000`. Reporter: `html` (open: never) + `list`.
- **Project order: console first, then panel** (`console-setup` → `console` → `panel-setup` → `panel`). `--project` filters still run isolated (each pulls only its login setup).
- **Web servers**: `webServer` array launches api-worker (`/healthz`), panel (3001) and console (3000) in parallel; `reuseExistingServer: true` locally (CI uses `reuseExistingServer: false`), 240s startup timeout.

**Structure**:

```
e2e/
├── global-setup.ts      # Suite tenant: console user → org (platform endpoint) → owner → seed
├── global-teardown.ts   # Wipes suite orgs + users (never fit-stack, never the plan catalog)
├── seed.ts              # Demo seed (pnpm seed:e2e): fills Fit Stack/fit-stack, idempotent, keeps data
├── fixtures.ts          # Shared test/api/consoleApi (panelApi.create/track auto-deletes per test, LIFO)
├── panel-setup.ts       # UI login only → panel-user.json (+ prewarm)
├── console-setup.ts     # UI login only → console-user.json (+ prewarm)
├── helpers/
│   ├── api.ts             # HTTP over real network: registerUser/signIn/organization/invite helpers + uid/uniqueEmail (per-test disposables only, org-scoped)
│   ├── api-client.ts      # ApiClient with resource tracking (create/track + cleanupDisposables)
│   ├── db.ts              # Direct dev DB (DATABASE_URL from apps/api-worker/.dev.vars): roles, lookups, wipeTenant (orgs+users; never the platform plan)
│   ├── domain.ts          # findByName/Email (resolve UI-created resources for track())
│   ├── platform.ts        # Provisioning: platform tenant, suite org via console endpoint, staff owner, platform sub, gym seed (check-then-create)
│   ├── test-tenant.ts     # Fixed identities: e2e-suite / e2e-empty slugs, reserved emails, seed literals, state.json
│   ├── prewarm.ts         # Route prewarm (Turbopack compile out of test time)
│   ├── modal.ts           # openModal(): robust click vs hydration race
│   ├── nav.ts             # navigateByClick(): robust navigation vs hydration race
│   └── selectors.ts       # Common design-system selectors (data-testid > role > text > CSS)
├── panel/
│   ├── auth.spec.ts       # Login, session, redirect, error toast
│   ├── dashboard.spec.ts  # KPIs, sidebar nav, navigation, charts row + revenue mini + report button
│   ├── members.spec.ts    # Members list, search, create via UI (tracked), KPI section, growth/birthdays, status/subscription URL filters
│   ├── plans.spec.ts      # Plans list, modal
│   ├── subscriptions.spec.ts # Pending-payment actionable (per-test API fixture + validate flow)
│   ├── classes.spec.ts    # Classes list, modal, week calendar (?week= nav), next class + visibility summary
│   ├── settings.spec.ts   # Tab navigation, General/Org/Currencies/Payments
│   ├── content.spec.ts    # CMS pages, list
│   └── empty-state.spec.ts # Empty states on e2e-empty (own storageState; never touches e2e-suite)
└── console/
    ├── auth.spec.ts       # Login, session
    ├── dashboard.spec.ts  # Stats, sidebar nav
    ├── organizations.spec.ts # List, search, create button, KPI filters
    ├── subscriptions.spec.ts # List, filters, KPIs, side panel
    ├── staff.spec.ts      # Table, side panel, role/search URL filters
    ├── plans.spec.ts      # List, create
    └── settings.spec.ts   # Tab navigation, General/Currencies/FreeTier/AI-Provider/Knowledge
```

**TestTenantState** (`e2e/.auth/state.json`, written by global-setup): `orgId/orgSlug` (suite), `ownerUserId`, `platformUserId`, `emptyOrgId/emptyOrgSlug/emptyOwnerEmail`, `ids` (seeded fixtures), `reusedExisting` (true when pre-existing users were reused, e.g. after `E2E_KEEP_DATA=1`), `createdAt`. Specs import `test`/`expect` from `../fixtures` (never from `@playwright/test` when they need `tenant`/`panelApi`/`consoleApi`).

**Seed** (`pnpm seed:e2e`, `e2e/seed.ts`): fills `Fit Stack`/`fit-stack` (create if missing, fill what's missing, never delete). Relative dates via `@workspace/shared` in org tz: 30 members in 6 monthly cohorts (backdated `created_at` via SQL — the only DB write for dates, seed-only), ~24 subs/payments spread by month + 3 `processing`, 4 plans, 3 weekly classes, 3 CMS pages, trial platform sub. Prints panel credentials on completion. Re-running reuses everything.

**Fixture cleanup rule**: per-test writes go through `panelApi.create()`/`track()` (auto-delete LIFO). A subscription is **not deletable** on purpose (`DELETE_ROUTES.subscription = null` in `helpers/api-client.ts`): the member delete (later in LIFO) cascades it away by FK, so the cleanup is still complete and the FK warning noise is gone. The suite-org wipe + global teardown are the safety net — no manual `afterAll` needed. `uid()`/`uniqueEmail()` are allowed only for per-test disposables inside `e2e-suite` (org-scoped, never for the shared tenant or `fit-stack`).

**Setup sessions**: `panel-setup` writes **two** storage states before the `panel` project creates any context — `panel-user.json` (suite org) and `empty-org-user.json` (org `e2e-empty`, used by `empty-state.spec.ts` via `test.use`). A `test.use({ storageState })` path must exist *before* the project runs, so it can never be created in a spec's `beforeAll`.

**Env vars** (optional):

- `E2E_KEEP_DATA=1` — skip teardown to inspect the suite tenant (next run resets anyway).
- `API_BASE_URL` / `PANEL_URL` / `CONSOLE_URL` — override app URLs (defaults: 8788/3001/3000).

**Dev dependencies** (root): `@playwright/test@1.63.0`, `@neondatabase/serverless@1.0.2`, `tsx` (seed runner), `@workspace/shared` (date utils in e2e/seed).

> When you add or change API behavior, the integration tests are the first line of defense: run `pnpm test` before asking for review.
> E2E tests validate complete user flows in the UI — run with `pnpm test:e2e` (separate from `pnpm test`).

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **Tests**: `pnpm test` runs the full suite (shared → api-worker → panel → console, Vitest). api-worker integration tests talk real HTTP to the Hono app against a Neon branch (`TEST_DATABASE_URL` in `apps/api-worker/.dev.vars`); without that variable they're skipped with a clear message, and they never run against the production database (hard guards). CI runs them on PRs (`ci.yml` job `test`).
- **Implementation plans**: Always use Spanish, ask for explicit approval before implementing
- **Database changes**: Require explicit user approval. `pnpm db:push` is forbidden on shared branches
- **Keep AGENTS.md updated** — After any structural change, update AGENTS.md to reflect it. When in doubt, update it.

### When to update AGENTS.md

- New API endpoints or route restructuring (e.g., migrating `/api/access-control` to api-worker when Bridge reactivates)
- Changes to RBAC (new roles, permission matrix changes, new modules)
- New business rules or module changes
- New apps or packages added to the monorepo (e.g., `console`, `auth`)
- Changes to dev commands or database workflow
- New auth patterns or security rules
- New skills or hooks that become project-wide conventions
- New CMS block types or page schema changes
- New Bridge endpoints or device management
- New cache key patterns
- New RSC patterns or RSC migrations in any app
- New queue event types or email/PDF flows in jobs-worker
- New E2E specs, helpers, or Playwright config changes

---

## Skills Available

Use skill tool for specialized tasks:

| Skill                         | When to use                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `database-designer`           | Database schema design (Drizzle)                                    |
| `neon-postgres`               | Neon database questions                                             |
| `interface-design`            | Admin panels, dashboards                                            |
| `copywriting`                 | Marketing copy changes                                              |
| `vercel-react-best-practices` | React/Next.js performance                                           |
| `next-best-practices`         | Next.js route handlers, data fetching, bundling, image optimization |
| `drizzle`                     | Type-safe SQL ORM operations                                        |
| `best-practices`              | Better Auth best practices                                          |
| `organization`                | Better Auth organizations, members, RBAC                            |
| `frontend-design`             | Distinctive frontend interfaces / UI polish                         |
| `neon-drizzle`                | Drizzle + Neon setup, migrations                                    |
| `terraform-stacks`            | Terraform Stacks configuration                                      |

> Skills installed locally in `.agents/skills/` (via `npx skills add`). To discover more: `npx skills find <query>` and confirm with the user before installing.

---

## Key Files to Read First

- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies
- `packages/database/src/schema.ts` — Full DB schema (30 tables)
- `packages/shared/src/access-control.ts` — RBAC statements + roles (single source of truth)
- `apps/api-worker/src/index.ts` — Hono app: middleware, mounts, healthcheck
- `apps/api-worker/src/lib/auth.ts` — Better Auth server config (per-request factory)
- `apps/api-worker/src/lib/route-handler.ts` — Auth/permission middleware
- `apps/api-worker/src/lib/cache.ts` — Upstash Redis wrapper
- `apps/api-worker/src/lib/cors.ts` — CORS allowlist
- `apps/api-worker/src/lib/env.ts` — Worker env/bindings types
- `apps/jobs-worker/src/index.ts` — Queue event contract (`FitTaskEvent`) + handlers
- `packages/auth/src/` — Shared auth client, service, hooks, permissions
- `packages/ui/src/components/safe-image.tsx` — SafeImage with skeleton loading + error fallback
- `packages/ui/src/components/next/image.tsx` — NextImage with error fallback UI
- `playwright.config.ts` — E2E config: projects, setup deps, webServers
- `e2e/panel-setup.ts` / `e2e/console-setup.ts` — E2E auth setup (storageState)

---

## Infrastructure & Deployment

> Current source in `docs/ARCHITECTURE.md` §8. Infra in `infrastructure/terraform/` (Workers, R2, Queues) managed with Terraform + GitHub Actions. **Never use `wrangler` manually.**
