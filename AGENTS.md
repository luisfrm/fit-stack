# Fit-Stack Agent Guide

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm test         # Full test suite (shared → api-worker → panel → console, Vitest)
pnpm format       # Format code (Prettier)

# Database (Drizzle ORM — all run via @workspace/database)
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema (LOCAL ONLY — never on shared branches)
pnpm db:pull      # Pull schema (LOCAL ONLY)
pnpm db:check     # Verify schema consistency
pnpm db:studio    # Open Drizzle Studio
pnpm db:seed      # Seed demo data (tsx src/seed.ts)

# Individual apps
cd apps/api-worker  && pnpm dev  # Cloudflare Workers API (Active) — port 8788
cd apps/jobs-worker # Cloudflare Queues Worker — port 8787
cd apps/panel       && pnpm dev  # Port 3001 (Gym Admin / Staff)
cd apps/web         && pnpm dev  # Port 3002 (Member Portal)
cd apps/console     && pnpm dev  # Port 3003 (Platform SaaS Admin)
cd apps/api         # [DEPRECATED] Next.js legacy API — port 3000 (⏸ pausado, read-only reference)

# Bridge (Python/Flet — managed separately with uv) ⏸ PAUSADO
# cd apps/bridge
# uv sync
# uv run python main.py
```

## Monorepo Structure

- **Apps**: `api-worker` (Hono / Cloudflare Workers API - **Active**), `jobs-worker` (Cloudflare Queues — email + PDF receipts), `panel` (Next.js 16, port 3001), `web` (Next.js 16, port 3002), `console` (Next.js 16, port 3003), `bridge` (Python/Flet desktop, **⏸ PAUSADO**), `api` (Next.js 16, **DEPRECATED** — ⏸ pausado, kept only as reference, excluded from pnpm workspace).
- **Packages**: `auth` (Better Auth client/hooks), `ui` (shadcn/ui), `shared` (DTOs/types/constants/RBAC), `database` (Drizzle ORM + Neon Postgres), `eslint-config`, `typescript-config`
- **Docs**: `docs/` — `PENDING.md`, `FUTURE_IDEAS.md`, `TIMEZONE_MANAGEMENT.md`, `RBAC-NEW-STRUCTURE-05-20-2026.md` y specs de diseño en `docs/superpowers/specs/` (ej. Hybrid FAB).
- **Architecture Spec**: For detailed design decisions, see [ARCHITECTURE.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/ARCHITECTURE.md).

- **Bridge is Python** — not part of Turbo, managed separately with `uv`

---

## Project Context (Business Overview)

### 1. Vision

Fit-Stack is a multi-tenant SaaS for the Gym and Fitness industry, primarily targeting the Latin American market. It solves the complexity of multi-currency billing, member retention, and automated physical access control.

- **Multi-tenancy**: Every gym is an `Organization`. Data isolation strictly enforced via `organizationId`.
- **B2B SaaS Model**: "Platform" layer (SaaS Admins) + "CMS" layer (Gym Admins).

### 2. Module Breakdown

| Module | Purpose |
|--------|---------|
| **Members** | Centralized identity for gym clients. Tracks historical behavior and preferences. |
| **Membership Plans** | Commercial product catalog. Defines durations (Daily, Weekly, Monthly, Yearly) and pricing in a configurable base currency (USD by default). |
| **Subscriptions** | Temporal access control linking a Member to a Plan. Uses **Cumulative Expiration Logic** — renewing adds time to current `endDate` so no paid day is lost. |
| **Payments** | Financial audit trail. Captures dynamic metadata (bank hashes, reference numbers, screenshots). Prevents duplicate registrations while `processing`. |
| **Platform (SaaS Admin)** | Super-admin panel in `apps/console`. Manage Organizations, FitStack plans, subscriptions, global settings, currencies, payment methods. |
| **Staff & Trainers** | HR and operations separation. Distinguishes business managers (Staff) from service deliverers (Trainers). |
| **Classes** | Group activity scheduling (Crossfit, Yoga, etc.) with capacity management. |
| **CMS (Dynamic Content)** | Drag-and-drop pages/blocks (hero, services, testimonials, gallery, contact, team_info). Authored in CMS, rendered in `web` via public API. |
| **Routines** | Exercise library, routine templates, workout sessions, coach-client assignments (future fitness app). |
| **Access Control / Bridge** | Desktop app (Flet/Python) for biometric/QR verification at entry. Sync queue + audit logs. **⏸ Pausado** — endpoints viven solo en `apps/api` legacy, no migrados al api-worker. |
| **Reports** | Revenue analytics with multi-currency normalization. |
| **Settings** | Localization and branding per gym (Timezone, currency formats, country config, OKLCH theme injection). |

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

> **⏸ Estado: PAUSADO.** El Bridge y `apps/api` están pausados. Los 3 endpoints (`/verify`, `/sync-tasks`, `/mark-synced`) y el repositorio `access-control.repository.ts` existen **solo en `apps/api` (legacy)** — el `apps/api-worker` activo **no** monta `/api/access-control` todavía. No hay migración en curso. Cuando se reactive, portar a un `createAccessControlRepository(db)` factory + router Hono con `requireApiKey` middleware, y agregar `ACCESS_CONTROL_API_KEY` a `apps/api-worker/src/lib/env.ts` + `secret_text_bindings` de Terraform.

### 5. Business Rules Summary

1. **Multi-currency**: System thinks in a base currency (USD by default) but allows payment in any active local currency via real-time exchange rates. Both configurable dynamically in **Settings**.
2. **Atomic Invoicing**: Subscriptions and Payments are created as an atomic unit to ensure financial and temporal data never desync.
3. **Strict Isolation**: No gym sees another gym's data. Everything scoped to `activeOrganizationId` in the session.
4. **Cumulative Expiration**: Renewing a subscription extends from the current `periodEnd` (not today), preserving all paid days.
5. **Grace Period Billing**: Platform subscriptions have a tiered grace period: 1-7 days overdue → `past_due`, 8-14 days → `read_only`, 15+ → `suspended`.

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

### 2. UI Design System & Hierarchy

- **Library Origins**: All UI components MUST be imported from `@workspace/ui` (`packages/ui`).
- **Variant Enforcement**: Use predefined variants. Do not use ad-hoc Tailwind classes to override sizes/spacing/styles unless absolutely necessary and after notifying the user.
- **Mathematical Scale + Premium Aesthetic**:
  - **Backgrounds**: `bg-input`, `bg-card`, `bg-surface`, translucent scales (`bg-white/5`, `bg-white/10`).
  - **Borders**: Low opacity boundaries (`border-white/5`, `border-white/10`, `border-input-border`) over solid hexes. Limit solid colors to focus rings.
  - **Border Radius**:
    - Inputs, Buttons, CheckboxCards → `rounded-md`
    - Cards, Containers → `rounded-xl`
    - Modals, Dialogs → `rounded-2xl`
- **Responsive Modal** (`packages/ui/src/components/modal.tsx`): renders a **bottom sheet** (drag handle + drag-to-close, `rounded-t-2xl`) on mobile (<768px vía `useIsMobile`) and a **centered modal** on desktop. Exports the legacy `Modal` (misma API: `trigger`/`title`/`description`/`footer`/`size`/`isScrollable`/`open`/`onOpenChange`) y la API compuesta `ResponsiveModal` / `ResponsiveModalTrigger` / `ResponsiveModalClose` / `ResponsiveModalContent` (icon, subtitle, `desktopMaxWidth`). Built on `radix-ui` Dialog; las animaciones open/close son **keyframes custom** en `packages/ui/src/styles/globals.css` (`animate-sheet-in/out`, `animate-modal-in/out`) que animan `translate`/`scale` para no chocar con el centrado de Tailwind v4; el overlay usa `tw-animate-css` (`data-open:`/`data-closed:`). Hook `useIsMobile` en `packages/ui/src/hooks/use-is-mobile.ts`.

### 3. Database Integrity & ORM

- **ORM**: Always Drizzle ORM. All DB code from `@workspace/database`.
- **Workflow**: `generate` → `review` → `migrate`. NO `push`, `generate`, `migrate`, or `seed` without explicit user approval.
- **Push Restriction**: `db:push` is EXCLUSIVELY for local prototyping. Strictly prohibited on shared branches or production.
- **Naming**: Table names are **singular** (`user`, `organization`). Repositories and Services are **plural** (`users.service.ts`).
- **No `pgEnum`**: Use `text('col').$type<UnionType>()` instead of Postgres enums — pgEnum breaks Drizzle migrations.
- **Validation**: Run `pnpm db:check` before pushing. CI verifies on PRs automatically.

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

#### CORS & Allowed Origins

The CORS allowlist is defined **in code only** — no env vars. Single source of truth in `apps/api-worker/src/lib/cors.ts`, consumed by:
- `apps/api-worker/src/lib/auth.ts` → `trustedOrigins` of Better Auth
- `apps/api-worker/src/index.ts` → `corsMiddleware` (Hono CORS)

| Ambiente | Origins permitidos |
|---|---|
| `development` | Any `http://localhost:*` (3001 panel, 3002 web, 3003 console, 8787 jobs, 8788 api) |
| `production` | Exact: `fitstack-panel.luisrivas.site`, `fitstack-console.luisrivas.site`, `fitstack-api.luisrivas.site`, `luisrivas.site` · Wildcards: `https://*.luisrivas.site` |

**Public routes skip auth**: `/healthz`, `/favicon.ico`, `/api/auth/*`, `/api/init`, `/api/public/*`. The global middleware tries to resolve a session but never blocks unauthenticated requests — machine-to-machine routes (e.g. access-control with `x-api-key`) work without a session.

### 6. Route Handler Pattern (`apps/api-worker/src/lib/route-handler.ts`)

The Hono API uses centralized middleware — never write auth/error boilerplate manually.

| Middleware | When to use | Auth check |
|---------|-------------|------------|
| `requireOrgPermission(module, action)` | Org-scoped CRUD routes | Session + orgId + permission via `auth.api.hasPermission` (with `can()` fallback) |
| `requireAuth()` | Org-scoped routes without permission check | Session + user only |
| `requirePlatformPermission(module, action)` | SaaS admin routes (`/api/platform/*`) | Session + platform permission via `auth.api.userHasPermission` |
| `requirePlatformAuth()` | Alias de `requirePlatformPermission('organization', 'create')` — middleware estándar de las rutas `/api/platform/*` | Session + permiso `organization.create` |

```ts
// Typical org-scoped route (Hono)
.get('/', requireOrgPermission(PM.MEMBERS, PA.READ), async (c) => {
  const orgId = c.get('session')!.activeOrganizationId!;
  const repo = createMembersRepository(c.get('db'));
  const service = createMembersService(repo, /* ...deps */);
  return c.json(await service.getAllMembers({ organizationId: orgId }));
})
```

- Body validation via `zValidator('json', schema)` from `@hono/zod-validator` (+ `zod`).
- Errors are normalized by the global `onError` handler (`apps/api-worker/src/lib/errors.ts`) → `{ error, details? }` envelope.
- The legacy `apps/api/lib/route-handler.ts` (`withAuth` / `withSession` / `withPlatformAuth`) is **deprecated** with the old API.

#### API Route Map (api-worker)

Rutas montadas en `apps/api-worker/src/index.ts` (todas bajo `/api`, salvo `/healthz` y `/favicon.ico`):

| Router | Endpoints notables |
|--------|--------------------|
| `/api/auth/*` | Better Auth engine (sesiones, orgs, invitations) |
| `/api/members` | CRUD gym members + invites (`members.service` encola `email.org_invite`) |
| `/api/plans` | Membership plans (catalog gym) |
| `/api/subscriptions` | CRUD subscriptions (registro de pago encola `email.payment_receipt`) |
| `/api/payments` | `PATCH /:id/status`, `POST /:id/send-email` (reenvío de recibo) |
| `/api/classes` | Class schedule CRUD |
| `/api/trainers` | Trainers (gym_member + coach_profile) |
| `/api/cms` | Content pages/blocks |
| `/api/dashboard` | KPI stats (cache `org:*:dashboard:stats:*`) |
| `/api/settings` | Gym settings (currencies, payment methods, theme) |
| `/api/reports` | `GET /revenue` (multi-currency, cache 1h) |
| `/api/organizations` | `GET /subscription-status` (estado de facturación del org) |
| `/api/upload` | `GET /` (list), `DELETE /`, `PUT /direct`, `POST /presigned` (R2) |
| `/api/ai` | `POST /chat` (chat streaming SSE: OpenAI SDK → Workers AI o `openrouter/free`), `GET /models` (allowlist) |

> **Chat IA**: el proveedor se infiere del model id (`getAiProvider` en `@workspace/shared`). `openrouter/free` usa el enrutador automático gratuito de OpenRouter (el fallback entre modelos gratuitos lo maneja OpenRouter). El primer evento SSE es `{"model": ...}` con el modelo concreto que respondió. `OPENROUTER_API_KEY` opcional; si falta y se pide un modelo OpenRouter → 503. |
| `/api/init` | Bootstrap de org (sin auth) |
| `/api/public` | `GET /pages/:slug` (CMS público, cache 15 min), `GET /files/*` (R2) — sin auth |
| `/api/platform/plans` | Catálogo de planes SaaS (console) |
| `/api/platform/subscriptions` | Suscripciones SaaS + invoices + `GET /stats` |
| `/api/platform/organizations` | CRUD orgs plataforma (console) |
| `/api/platform/settings` | Settings globales de plataforma |
| `/api/platform/staff` | Staff de plataforma (invites console → encola `email.registration_invite`) |

> `/api/access-control/*` **NO está montado** en api-worker (Bridge pausado — ver sección 4).

### 7. Error Handling & Mutations

- **User Feedback**: No silent `console.log()` errors in production. All mutations MUST use `try/catch` with `toast.success`/`toast.error` from explicit server responses.
- **Implementation Plans**: Write in **Spanish**. Always ask for explicit approval before implementing.

### 8. HTTP Client (ofetch — NO `fetch` nativo)

**ESTÁ PROHIBIDO usar `fetch` nativo.** Todas las peticiones HTTP se hacen con **ofetch**:

- **API de Fit-Stack (api-worker)** → SIEMPRE a través del cliente context-aware de cada app:
  - Console: `apps/console/lib/api/client.ts` (export `api`)
  - Panel: `apps/panel/lib/api/client.ts` (exports `api` y `apiBlob`)
  - El cliente añade `baseURL` (`${apiBaseUrl}/api`), **forwardea cookies en server** (RSC), `credentials: "include"` en client, `retry`/`timeout`, e intercepta `ORGANIZATION_NOT_FOUND`.
  - Server actions que invalidan cache (`updateTag`) + `router.refresh()` NO hacen peticiones HTTP — se combinan con `api()` para las llamadas.
- **APIs externas** (ej. exchange rates de open.er-api.com) → `ofetch` directo, SIN pasar por el cliente interno (que no debe enviar sesión ni baseURL del API). Ver `apps/{console,panel}/lib/api/exchange-rates.ts` con `next: { revalidate }` para cache de Next.
- `next/headers` (`cookies()`, `headers()`) se usa solo para leer contexto de la request — nunca para hacer la petición HTTP.

**Env vars frontend** (`apps/{panel,console}/lib/config/envs.ts`, validadas con Zod): `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_R2_URL` (obligatorias); `NEXT_PUBLIC_EXCHANGE_URL` (opcional, leída en `lib/api/exchange-rates.ts`, default `https://open.er-api.com/v6/latest`).

---

## Redis Caching (Upstash)

The API uses **Upstash Redis** (`@upstash/redis` v1.37.0) for serverless-compatible caching.

### Setup

- **Wrapper**: `apps/api-worker/src/lib/cache.ts` — `createCache(env)` with error handling; Redis being down never blocks requests (graceful degradation).
- **Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both optional)

### Cache Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(key: string)` | Fetch cached value by key |
| `set` | `set(key, data, ttlSeconds?)` | Store value with optional TTL (default 5 min) |
| `invalidate` | `invalidate(pattern: string)` | Delete all keys matching a glob pattern (uses SCAN) |
| `invalidateExact` | `invalidateExact(key: string)` | Delete a single key |

### Cache Key Conventions

| Pattern | TTL | Used For |
|---------|-----|----------|
| `org:${orgId}:settings` | 10 min | Organization settings |
| `org:${orgId}:profile` | 5 min | Active org profile in custom session (branding/theme/timezone) |
| `org:${orgId}:plans:*` | 5 min | Membership plans |
| `org:${orgId}:classes:*` | 5 min | Classes |
| `org:${orgId}:members:*` | 5 min | Gym members |
| `org:${orgId}:subscriptions` | 5 min | Member subscriptions |
| `org:${orgId}:dashboard:stats:*` | 5 min | Dashboard KPIs |
| `org:${orgId}:coaches:*` | 5 min | Coaches/trainers |
| `org:${orgId}:cms:pages*` | 5 min | CMS content pages |
| `org:${orgId}:public:page:*` | 15 min | Public page slugs (web) |
| `org:${orgId}:subscription-status` | 1 min | Org billing status |
| `org:${orgId}:reports:revenue:12m` | 1 hr | Monthly revenue reports |
| `member:role:${userId}:${orgId}` | 1 min | Cached Better Auth member role (custom session) |
| `platform:settings` | 10 min | SaaS-level global settings |
| `platform:organizations*` | 5 min | Organization list (SaaS admin) |
| `platform:plans*` | 10 min | Platform plan catalog |
| `platform:subscriptions*` | 5 min | SaaS subscriptions |
| `platform:subscriptions:stats` | 5 min | Subscription KPI stats |
| `platform:staff*` | 5 min | Platform staff (SaaS admins: support/admin/owner) |

### Cache Invalidation Strategy

- **On writes (POST/PUT/DELETE)**: Invalidate related cache patterns immediately — e.g., creating a subscription invalidates `platform:subscriptions*`, `platform:subscriptions:stats`, and `org:${orgId}:subscription-status`
- **Role invalidation**: `afterUpdateMemberRole` hook in Better Auth invalidates `member:role:${userId}:${orgId}` so role changes take effect instantly
- **Graceful degradation**: All cache methods wrap errors with `console.error` and return `null`/void — Redis being down never blocks requests

---

## Background Jobs (Cloudflare Queues)

Los emails y la generación de PDF se procesan **asíncronamente** vía Cloudflare Queues: el `api-worker` produce eventos en el binding `TASK_QUEUE` (`fit-task-events`, DLQ `fit-task-events-dlq`) y `apps/jobs-worker` los consume.

**Contrato de eventos** (`FitTaskEvent` — `apps/jobs-worker/src/index.ts`):

| Type | Payload | Producer |
|------|---------|----------|
| `email.registration_invite` | `{ email, token, target?: 'panel' \| 'console', role? }` | `members.service.ts` (invitar miembro sin cuenta → panel) + `/api/platform/staff` (invitaciones console) |
| `email.org_invite` | `{ email, orgName, inviterName, inviteLink }` | Hook `sendInvitationEmail` de Better Auth en `lib/auth.ts` (invitación a miembro con cuenta) |
| `email.payment_receipt` | `{ paymentId, organizationId }` | `subscriptions.service.ts` (al registrar un pago) |

**Handlers** (`apps/jobs-worker/src/handlers/`):
- `email.handler.ts` — envía emails con **Resend** (`EMAIL_PROVIDER=resend`) o **Gmail SMTP** (`EMAIL_PROVIDER=gmail` + `SMTP_USER`/`SMTP_PASS`).
- `pdf.handler.ts` — genera el recibo de pago en PDF con `@react-pdf/renderer` y lo envía por email.

**Env vars (jobs-worker)**: `DATABASE_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_USER`, `SMTP_PASS`, `PANEL_URL`, `CONSOLE_URL`.

> **Regla**: nunca acoplar el api-worker a envíos síncronos de email/PDF — siempre encolar en `TASK_QUEUE` y dejar que el jobs-worker procese.

---

## Platform Subscription Status (Organization Billing)

Subscription status is **computed dynamically** via SQL CASE — NOT stored in DB.

**Constants** (`@workspace/shared/constants`):
```ts
PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active",      // currentPeriodEnd >= now
  PAST_DUE: "past_due",  // 1-7 days overdue
  READ_ONLY: "read_only", // 8-14 days overdue
  SUSPENDED: "suspended", // 15+ days overdue
  CANCELLED: "cancelled", // manually cancelled or invoice void
}
```

**Computation** (`platform-subscriptions.repository.ts`):
- `cancelledAt IS NOT NULL` → `cancelled`
- Latest invoice `status = VOIDED` → `cancelled`
- `currentPeriodEnd >= CURRENT_TIMESTAMP` → `active`
- Days overdue ≤ 7 → `past_due`
- Days overdue ≤ 14 → `read_only`
- Days overdue > 14 → `suspended`

**Validation flow** (`apps/panel/app/dashboard/layout.tsx`):
- `SUSPENDED` / `CANCELLED` → redirect to `/no-subscription`
- `PAST_DUE` / `READ_ONLY` → show `<SubscriptionWarningBanner />`
- `ACTIVE` → normal render

**Endpoint**: `GET /api/organizations/subscription-status` (reads org from session) — fetch envuelto en `getOrgSubscriptionStatus(activeOrgId)` (`apps/panel/lib/services/subscription-status.ts`), usado por el layout y por la gate page.

**Gate pages dinámicas** (`/no-subscription`, `/unauthorized` en panel y console) — Server Components con `force-dynamic` que chequean la sesión en cada request: sin sesión → `redirect('/login')`; con acceso válido (suscripción activa o rol permitido) → `redirect('/dashboard')`; solo sin acceso se renderizan. Evita quedarse pegado tras cerrar sesión o refrescar.
- **Note**: The `/no-subscription` page is OUTSIDE `/dashboard` layout to prevent infinite redirect loops.

---

## Role-Based Access Control (RBAC)

Fit-Stack uses **two levels of roles**: Global (platform) and Organization (tenant).

### Global Roles

```ts
// packages/shared/src/constants.ts
GLOBAL_ROLES = {
  ADMIN: "admin",  // Global super-admin — full access to /api/platform/* + apps/console
  USER: "user",    // Default platform user
}
```

Platform roles for Better Auth admin plugin (`platformRoles`): `owner`, `admin`, `support` (defined in `packages/shared/src/access-control.ts`).

**Console access gate**: `canAccessConsole(role)` (`@workspace/shared`) — `true` solo para roles con `organization.create` (admin/owner); `support` es read-only y no entra al layout de console.

### Organization Roles

```ts
ORG_ROLES = {
  OWNER: "owner",     // Super Admin / Creator — total control
  MANAGER: "manager", // Gym Owner/Manager — full tenant control
  CASHIER: "cashier", // Staff/Cashier — payments and check-ins
  COACH: "coach",     // Trainer — routines and athlete progress
  MEMBER: "member",   // Gym client — app access to their own data
}
```

### Permission Matrix

**Source of truth**: `packages/shared/src/access-control.ts` — `organizationStatement` + `organizationAc.newRole(...)` (Better Auth Access Control). Helpers in `packages/shared/src/permissions/` expose the matrix through `can(role, module, action)`.

| Module | Owner | Manager | Cashier | Coach | Member |
|--------|:-----:|:-------:|:-------:|:-----:|:------:|
| **Panel** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Dashboard** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Reports** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Members** | ✅ CRUD | ✅ (no delete) | ✅ (no delete) | ❌ | ❌ |
| **Staff** | ✅ CRUD | ✅ (no delete) | ❌ | ❌ | ❌ |
| **Subscriptions** | ✅ CRUD | ✅ (no delete) | ✅ (no delete) | ❌ | ❌ |
| **Plans** | ✅ CRUD | ✅ (no delete) | ✅ read | ✅ read | ✅ read |
| **Classes** | ✅ CRUD | ✅ (no delete) | ✅ (no delete) | ✅ (no create/delete) | ✅ read |
| **Content** | ✅ CRUD | ✅ (no delete) | ❌ | ✅ read | ✅ read |
| **Settings** | ✅ r+w | ✅ r+w | ✅ read | ❌ | ❌ |
| **Organization** | ✅ r+w | ✅ r+w | ❌ | ❌ | ❌ |
| **AI (Chat)** | ✅ read | ✅ read | ✅ read | ❌ | ❌ |

### How to Verify Permissions

**In API routes (api-worker)**: Use `requireOrgPermission` / `requirePlatformPermission` middleware from `apps/api-worker/src/lib/route-handler.ts`
```ts
import { requireOrgPermission } from '../lib/route-handler'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'

.get('/', requireOrgPermission(PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.READ), async (c) => { ... })
```

**In UI (client-side)**: Use `useAuth()` and `usePermissions()` from `@workspace/auth/hooks`
```tsx
import { useAuth, usePermissions } from '@workspace/auth/hooks'
const { isOwner, isManager, isCashier, isCoach, isMember, orgRole } = useAuth()
const { can } = usePermissions()
const canEditClasses = can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)
```

### Anti-escalation

Use `canAssignRole(actor, target)` from `@workspace/shared` (`packages/shared/src/permissions/role-assignment.ts`) to prevent role escalation:
- `OWNER` → can assign any role
- `MANAGER` → cannot assign `OWNER`
- `CASHIER` → can only assign `MEMBER`

**Platform anti-escalation** (`canAssignPlatformRole(actor, target)`):
- `owner` → puede asignar cualquier rol de plataforma (support/admin/owner)
- `admin` → solo `support` o `admin` (NUNCA `owner`)
- `support` → no puede asignar

> La anti-escalación se valida **server-side** en `/api/platform/staff` (POST y DELETE) — la UI solo filtra opciones.

### Panel Access Control

Only `OWNER`, `MANAGER`, `CASHIER` can use the panel app (`apps/panel`). Implemented via the `panel: ["access"]` permission (`PANEL` module, `ACCESS` action):
```ts
import { usePermissions } from '@workspace/auth/hooks'
const { canAccessCms } = usePermissions()  // equivalent to can(PANEL, ACCESS)
if (orgRole && !canAccessCms()) redirect('/unauthorized')
```

### Security Rules

1. **Never trust client-side role checks** — Always re-verify in API
2. **Session-based authorization** — Use `session.member.role` from Better Auth
3. **Organization scoping** — All queries MUST filter by `organizationId`
4. **No global admin bypass in CMS** — Global roles are for SaaS platform management only
5. **Platform user upload bypass** — Users with global roles `admin`, `owner`, or `support` can upload files to any organization without requiring org membership (`POST /api/upload/presigned`). Non-platform users still require org membership + upload permission (`MEMBERS.CREATE` or `CONTENT.CREATE`).

---

## Shared Package Exports (`packages/shared`)

```ts
// Entry point: @workspace/shared
// Re-exports: constants, types, access-control, auth-config, permissions

// constants.ts
GLOBAL_ROLES, ORG_ROLES, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES,
PLATFORM_SUBSCRIPTION_STATUSES, COUNTRIES (8 countries: VE/CO/MX/AR/CL/PE/ES/US),
DEFAULT_COUNTRY, COUNTRY_LIST, ICountryConfig,
ORG_ROLE_LABELS + formatOrgRole (roles de organización/Panel),
PLATFORM_ROLE_LABELS + formatPlatformRole (roles de plataforma/Console: owner, admin, support, user)

// types.ts
IUser, ISession, IAuthMember, IOrganization, ICmsClass, IMember, MemberFilter,
PaginatedMembers, IAuthError, TrendDirection, FrequencyType, PlanFeatures, IPlatformOrganization

// access-control.ts
platformStatement/platformAc/platformRoles (owner, admin, support),
organizationStatement/organizationAc/organizationRoles (owner/manager/cashier/coach/member),
orgRoleDefinitions, canAccessConsole(role), PlatformStatement, OrganizationStatement,
OrgRole/PlatformRole types. Re-exports PERMISSION_MODULES and PERMISSION_ACTIONS.

// auth-config.ts
ORGANIZATION_ADDITIONAL_FIELDS (slogan, countryCode, taxId, legalName, address, fiscalConfig, timezone)

// permissions/
  modules.ts:         PERMISSION_MODULES (12 modules: dashboard, reports, members, staff,
                      subscriptions, plans, classes, content, settings, organization, ai, panel)
  actions.ts:         PERMISSION_ACTIONS (READ, CREATE, UPDATE, DELETE, ACCESS)
  can.ts:             can(role, module, action), canAny(), hasAccess (alias of can)
  role-assignment.ts: canAssignRole(actor, target) (org) y canAssignPlatformRole(actor, target) (plataforma)

// ai.ts
AI_MODEL_IDS, OPENROUTER_FREE_MODEL_IDS, ALL_CHAT_MODEL_IDS (allowlist — single source
of truth consumida por api-worker para validar/rutear proveedor y por panel para el
selector vía RSC), AiProvider ("workers-ai" | "openrouter"), getAiProvider(modelId),
AI_MODELS, IAiChatMessage, IAiChatRequest, IAiSseEvent (contrato SSE del chat)
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

## Database Schema (28 tables)

### Better Auth Core
`user`, `session`, `account`, `verification`

### Organization & Membership
`organization` (includes: slogan, countryCode, timezone, taxId, legalName, address, fiscalConfig)
`member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)
`platform_plan` (catalog with features as PlanFeatures, price in centavos), `platform_subscription` (status computed in SQL — `status` column is legacy), `platform_subscription_payment` (invoices with commercial snapshots)

### Gym Domain
`gym_member` (local profiles, linked to user via userId), `coach_profile` (1:1 extension),
`coach_assignment` (coach ↔ client)

### Memberships & Payments
`membership_plan` (gym product catalog), `subscription` (member ↔ plan), `payment` (financial audit trail)

### Access Control
`access_control_log` (every access attempt: granted, denied, error), `biometric_sync_task` (device sync queue)

### Routines (Fitness)
`exercise`, `routine_template`, `routine_template_item`, `workout_session`, `workout_session_log`

### CMS & Web
`gym_class` (class schedule), `content_page`, `content_block` (blocks by type with display order)

### Settings
`platform_setting`, `gym_setting`

---

## Console API Layer (ofetch)

`apps/console` usa **ofetch** como wrapper unificado de `fetch` nativo (regla global: **no raw `fetch`** — ver sección 8 de Technical Standards). Reemplaza axios con una API más liviana (~6kb) y soporte nativo para `next: { revalidate, tags }`.

### Estructura

```
lib/
├── api/
│   ├── client.ts          ← ofetch.create() context-aware
│   ├── types.ts           ← ApiFetchOptions (extiende FetchOptions + next)
│   └── exchange-rates.ts  ← fetch externo (sin auth)
├── services/              ← métodos tipados (reusables desde RSC y client)
│   ├── organizations-service.ts
│   ├── platform-plans-service.ts
│   ├── platform-subscriptions-service.ts
│   ├── staff-service.ts (platform staff: getAll/create/revoke/validateToken/accept)
│   ├── currency-service.ts (legacy, usar lib/api/exchange-rates en RSC)
│   ├── init-service.ts
│   ├── upload-service.ts
│   └── session-service.ts (usa authClient, sin cambios)
└── hooks/                 ← hooks vanilla (sin TanStack Query): use-auth, use-debounce,
                             use-exchange-rates, use-organization-activation, use-theme
```

### Comportamiento context-aware (`lib/api/client.ts`)

| Contexto | Manejo de cookies | Interceptors |
|----------|------------------|--------------|
| **Server (RSC)** | Lee `cookies()` de `next/headers` y los forwardea como `Cookie` header | Sin `window.location` (no-op) |
| **Client (browser)** | `credentials: 'include'` (browser envía cookies automáticamente) | `ORGANIZATION_NOT_FOUND` → `window.location.href = '/reset-org-context'` |

### Patrón de uso en services

```ts
import { api, type ApiFetchOptions } from "@/lib/api/client";

export const exampleService = {
  // RSC: pasa { next: { revalidate, tags } } para cachear
  async getAll(
    params?: { page?: number; limit?: number },
    options?: ApiFetchOptions,
  ) {
    return await api("/example", { query: params, ...options });
  },

  // Client: sin options, ofetch no cachea
  async create(data: any) {
    return await api("/example", { method: "POST", body: data });
  },
};
```

### Convención post-mutation

Toda mutación desde un client component (modal/form) debe:

```ts
// 1. Llamar el service
// 2. Invalidar el cache tag
// 3. Refrescar el RSC

import { updateTag } from "next/cache";
import { useRouter } from "next/navigation";

const router = useRouter();
const refresh = async () => {
  "use server";
  updateTag("console:orgs");  // tag del cache del server component
};

const handleSuccess = async () => {
  await organizationsService.create(data);
  router.refresh();  // re-fetchea el server component
};
```

> **Nota Next.js 16**: `revalidateTag(tag, profile)` ahora requiere un `profile` (string o `CacheLifeConfig`). Para server actions usar `updateTag(tag)` (nuevo en Next 16, sin profile).

### Console Cache Tags

| Tag | Endpoint |
|-----|----------|
| `console:orgs` | `/api/platform/organizations*` |
| `console:plans` | `/api/platform/plans*` (with-stats, summary) |
| `console:subs` | `/api/platform/subscriptions*` (incluye /stats) |
| `console:settings` | `/api/platform/settings` |
| `console:staff` | `/api/platform/staff` |

### RSC Pattern en `apps/console`

- **Páginas son Server Components** (sin `"use client"`) que llaman services directo con caching options.
- **Filtros y paginación en URL** (`searchParams` es `Promise<...>` en Next 15+):
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
- **Hojas cliente** (search inputs, pagination buttons, modales) usan `useRouter` + `searchParams` de `next/navigation` para modificar la URL → re-render server.
- **Type C pages** (currencies, payment-methods) ya son **RSC parent + client child con `initialData`**: el server fetchea settings (`console:settings`) y el client arranca con el dato (sin loading flash) y guarda vía `api POST` + server action `updateTag`. La página `organizations/[id]/settings` sigue siendo client (fetch con `useState`/`useEffect`, sin TanStack Query).
- **TanStack Query está ELIMINADO del proyecto** (console y panel). Estándar único: **RSC + ofetch + cache de Next para todos los reads**; las mutaciones en páginas RSC usan `service → toast → updateTag → refresh`. Solo se reintroduciría una librería de fetching client-side si una feature de datos en vivo (polling, UI optimista, infinite scroll) lo justifique.

### Constantes de settings

- `PLATFORM_SETTINGS_KEYS` → `apps/console/lib/config/platform-settings.ts` (settings de plataforma)
- `SETTINGS_KEYS` → `apps/console/lib/config/settings.ts` (settings de organización)

Ambas se importan desde server y client (no dependen de hooks).

---

## Testing (Vitest)

Suite completa con `pnpm test` (shared → api-worker → panel → console). Config en cada `vitest.config.ts`; helpers en `apps/api-worker/tests/`.

**api-worker — tests de integración** (`tests/integration/`, `pnpm --filter api-worker test:integration`):
- **HTTP real, sin mocks**: `app.fetch(request, env, ctx)` — el mismo entry point de producción — contra una **branch de Neon** (`TEST_DATABASE_URL` en `apps/api-worker/.dev.vars`; leer `tests/setup.ts`).
- **Guardas duras**: se niega a correr si `TEST_DATABASE_URL` apunta al mismo host+db que `DATABASE_URL`; sin `TEST_DATABASE_URL` toda la suite se salta con `describe.skipIf` (CI incluido).
- **Determinismo**: `fileParallelism: false` (una branch compartida), `TRUNCATE ... RESTART IDENTITY CASCADE` entre archivos (`tests/helpers/db.ts`), Redis ausente a propósito (cache no-op).
- **Spies grabadores** para R2 y Queues (`tests/helpers/env.ts`) — se puede assertear eventos encolados (ej. `email.payment_receipt`).
- **Fixtures** (`tests/helpers/auth.ts`): sign-up/orgs por HTTP real (Better Auth), inserción SQL directa solo para lo que no tiene endpoint (roles globales).
- **Sincronizar schema**: `pnpm --filter api-worker test:db:push` (drizzle-kit push contra la branch de test, nunca producción).

**panel/console — tests unit** (`tests/unit/`, jsdom + Testing Library): helpers de UI y utilidades puras.

> Cuando agregues o cambies comportamiento del API, los tests de integración son la primera línea de defensa: corre `pnpm test` antes de pedir review.

---

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **Tests**: `pnpm test` runs the full suite (shared → api-worker → panel → console, Vitest). Los tests de integración de api-worker hablan HTTP real al Hono app contra una branch de Neon (`TEST_DATABASE_URL` en `apps/api-worker/.dev.vars`); sin esa variable se saltan con mensaje claro, y jamás corren contra la base de producción (guardas duras). CI los ejecuta en PRs (`ci.yml` job `test`).
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

---

## Skills Available

Use skill tool for specialized tasks:

| Skill | When to use |
|-------|-------------|
| `database-designer` | Database schema design (Drizzle) |
| `neon-postgres` | Neon database questions |
| `interface-design` | Admin panels, dashboards |
| `copywriting` | Marketing copy changes |
| `vercel-react-best-practices` | React/Next.js performance |
| `next-best-practices` | Next.js route handlers, data fetching, bundling, image optimization |
| `drizzle` | Type-safe SQL ORM operations |
| `best-practices` | Better Auth best practices |
| `organization` | Better Auth organizations, members, RBAC |
| `frontend-design` | Distinctive frontend interfaces / UI polish |
| `neon-drizzle` | Drizzle + Neon setup, migrations |
| `terraform-stacks` | Terraform Stacks configuration |

> Skills instaladas localmente en `.agents/skills/` (vía `npx skills add`). Para descubrir más: `npx skills find <query>` y confirmar con el usuario antes de instalar.

---

## Key Files to Read First

- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies
- `packages/database/src/schema.ts` — Full DB schema (28 tables)
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

---

## Infrastructure & Deployment (Terraform + GitHub Actions)

Toda la infraestructura de Cloudflare (Workers, R2, Queues, Secrets) se gestiona con Terraform y los despliegues se automatizan con GitHub Actions. **Nunca se usa wrangler manualmente.**

### Modelo de ambientes

Un solo set de archivos Terraform. Los workflows son **uno solo** y seleccionan el ambiente vía `inputs.environment` o vía la rama de Git.

Los secretos y variables son **nombres simples** (sin prefijo). GitHub ya los aísla por environment, así que `CLOUDFLARE_API_TOKEN` en `production` es distinto de `CLOUDFLARE_API_TOKEN` en `staging`.

Por ahora solo está configurado **`production`**. Para agregar un ambiente nuevo, ver "Cómo escalar" más abajo.

### Estructura

```
infrastructure/terraform/
├── backend.tf            # Backend S3 en R2 (sin account_id hardcodeado)
├── providers.tf          # Cloudflare provider
├── variables.tf          # Variables
├── main.tf               # Locals
├── workers.tf            # Workers (+ secret_text_bindings inline)
├── queues.tf             # Colas + DLQ
├── storage.tf            # R2 bucket
├── secrets.tf            # Nota: secrets van inline en workers.tf
├── outputs.tf            # Outputs
└── modules/              # Módulos reutilizables
    ├── worker/
    ├── r2_bucket/
    └── queue/
```

### Workflows de GitHub Actions

| Workflow | Trigger | Ambiente seleccionado |
|----------|---------|----------------------|
| `terraform.yml` | `workflow_dispatch` con `environment` | cualquier ambiente |
| `deploy-api-worker.yml` | push a `master`/`develop` o `workflow_dispatch` | `production` (master) / `dev` (develop) |
| `deploy-jobs-worker.yml` | push a `master`/`develop` o `workflow_dispatch` | `production` (master) / `dev` (develop) |
| `database-migrations.yml` | push a `master`/`develop` o `workflow_dispatch` | `production` (master) / `dev` (develop) |

### Environment de GitHub

- **`production`**: con aprobador. Por ahora es el único.

> Cuando agregues `staging` o `dev`, crea el environment correspondiente y define si requiere aprobación.

### Variables y Secrets

Todos los valores se configuran **a nivel de environment** en GitHub (no a nivel de repositorio). GitHub los aísla automáticamente por ambiente, por eso no usamos prefijos.

**Secrets por environment (nombres simples, sin prefijo):**
- `CLOUDFLARE_API_TOKEN` (token de **deploy/provider** — permisos Workers/R2/Queues; auth de wrangler y del provider Terraform. **NO** es el token de Workers AI)
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `R2_PUBLIC_URL`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `COOKIE_DOMAIN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_PROVIDER` (`resend` o `gmail` — jobs-worker)
- `SMTP_USER`
- `SMTP_PASS`
- `PANEL_URL`
- `CONSOLE_URL`
- `CLOUDFLARE_AI_API_TOKEN` (token **Workers AI**: Run para `/api/ai` — api-worker. Binding del worker con el mismo nombre; en local va en `.dev.vars` como `CLOUDFLARE_AI_API_TOKEN`)
- `AI_GATEWAY_URL` *(opcional — si se setea, `createWorkersAIClient` apunta al AI Gateway en vez de Workers AI directo)*
- `OPENROUTER_API_KEY` *(opcional — necesario para el modelo `openrouter/free`)*
- `TEST_DATABASE_URL` *(opcional — branch de Neon para la suite de integración de api-worker; sin él, los tests de integración se saltan en CI)*
- `ACCESS_CONTROL_API_KEY` *(pausado: se agregará si se reactiva Bridge y se migra access-control al api-worker)*

**Variables por environment (nombres de recursos, no sensibles):**
- `API_WORKER_NAME` (ej: `fit-stack-api`)
- `JOBS_WORKER_NAME` (ej: `fit-stack-jobs`)
- `FILES_BUCKET_NAME` (ej: `fit-stack-files`)
- `QUEUE_NAME` (ej: `fit-task-events`)
- `DLQ_QUEUE_NAME` (ej: `fit-task-events-dlq`)

**Repository secrets (compartidos por todos los environments):**
- `TFSTATE_R2_ACCOUNT_ID`
- `TFSTATE_R2_ACCESS_KEY_ID`
- `TFSTATE_R2_SECRET_ACCESS_KEY`

> Los secrets del bucket de estado son **repository secrets** (no por environment) porque solo hay un bucket de estado para todos los ambientes.

### Estado remoto (R2)

- Bucket: `fit-stack-terraform-state`
- Path: `s3://fit-stack-terraform-state/<environment>/terraform.tfstate`

### Cómo escalar a más ambientes

**Para crear un nuevo ambiente (ej. `staging`):**

1. GitHub: `Settings > Environments > New environment > staging`.
2. Decide si requiere aprobador.
3. En la sección "Environment secrets", agrega los mismos secrets que tiene `production` (con los valores de staging).
4. En la sección "Environment variables", agrega los nombres de los recursos de staging (ej: `API_WORKER_NAME=fit-stack-api-staging`).
5. Ejecuta `terraform.yml` con `environment: staging`.
6. Listo. Los workflows de deploy también lo soportan automáticamente.

**Para desplegar en otra cuenta de Cloudflare:**

1. Crea la cuenta en Cloudflare.
2. Crea un nuevo API Token en esa cuenta.
3. Crea un nuevo GitHub Environment (ej: `fitstack`).
4. En ese environment, configura `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` con los valores de la nueva cuenta.
5. Configura el resto de secrets con valores apuntando a esa cuenta.
6. Configura las variables de nombres de recursos.
7. Ejecuta `terraform.yml` con `environment: fitstack`.

**Cero cambios en código** para agregar ambientes o cuentas. Todo se hace en la UI de GitHub.

### Reglas

1. **Nunca** ejecutar `wrangler` a mano para deploys. Usar los workflows.
2. **Nunca** commitear valores reales. Usar GitHub Secrets.
3. **Nunca** modificar manualmente recursos en Cloudflare. Todo pasa por Terraform.
4. **Cambios en `infrastructure/terraform/**` requieren PR**.
5. **Migraciones de base de datos requieren aprobación manual** (environment `production`).
