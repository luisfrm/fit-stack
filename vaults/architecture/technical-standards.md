> **Alcance:** texto íntegro de "Project Rules (Technical Standards)" (§1–§11). En `AGENTS.md` queda la versión condensada de invariantes; aquí está el detalle completo con ejemplos, paths y símbolos.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

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
- **Form required convention**: `Input` uses native `required`; `CountrySelector` and `SimpleSelect` accept a `required` prop (renders `*` on the label). Forms group into sections and close with the note "Fields with _ are required." (Fields with _ are required.)
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
- **No interactive transactions (serverless)**: `api-worker` runs on Cloudflare Workers with Neon's **HTTP** driver, where interactive `db.transaction()` **does not exist**. Atomicity is achieved with a **single statement** (canonical pattern: the receipt sequence, `INSERT … ON CONFLICT DO UPDATE … RETURNING`) or with **explicit compensation** in the service's `catch`. Never wrap multiple writes in a transaction nor assume automatic rollback.

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
- **Writing the location in the panel**: the organization identity (name/slug/logo/slogan/timezone/currencyFormat + legalName/taxId/address/`fiscalConfig`) is saved with `orgProfileService.updateProfile` → **`PATCH /api/organizations/profile`** (org-scoped, `ORGANIZATION.UPDATE`). The panel **never** calls `/api/platform/organizations` from a tenant form: that endpoint requires `requirePlatformAuth` (platform permission) and a gym owner/manager receives **403**. `countryCode`/`primaryCurrency` are immutable post-creation (400 `IMMUTABLE_FIELD`); changing the country recalculates the primary currency and is a platform-level operation.

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
- Errors are normalized by the global `onError` handler (`apps/api-worker/src/lib/errors.ts`) → `{ error, details? }` envelope. An `HTTPException` that brings its own `Response` (`err.res`) is returned **as-is**: this is how the documented business codes arrive (`409 { code: 'SLUG_TAKEN' }`, `403 { code: 'FEATURE_NOT_AVAILABLE', feature }`) — toasts are resolved by code, never by text.
- The legacy `apps/api/lib/route-handler.ts` (`withAuth` / `withSession` / `withPlatformAuth`) is **deprecated** with the old API.

### 7. Error Handling & Mutations

- **User Feedback**: No silent `console.log()` errors in production. All mutations MUST use `try/catch` with `toast.success`/`toast.error` from explicit server responses.
- **Toasts and API errors (rule)**: toasts NEVER show raw API messages (`err?.data?.error`, `error.message`, server string matching). Mandatory pattern: `mutationError(scope, err, "<generic action message>")` (helper in `apps/{panel,console}/lib/errors.ts` — logs the raw error with `console.error` and returns the fallback) + `toast.error(...)`, e.g. "Could not save the plan". Exceptions with UX meaning (e.g. AI quota exhausted) are handled by mapping the **error code** (`err.data?.code`), never by text.
- **Implementation Plans**: a plan is a **Linear issue**, written in **English** (see [Task Tracking (Linear)](#task-tracking-linear)); the chat response about it is in **Spanish**. Always ask for explicit approval before implementing.

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
- **Platform (SaaS) billing operates in UTC**: it calls the shared `addDuration(…, 'UTC')` **explicitly** — never mixed with the org tz. The old `billing-utils.ts` UTC copy was deleted; `addDuration` now requires the tz (no silent `America/Caracas` fallback).

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
