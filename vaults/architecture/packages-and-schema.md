> **Alcance:** exports de `@workspace/shared` y `@workspace/auth` + esquema completo de la base de datos (33 tablas).
> Fuente: [`AGENTS.md`](../../AGENTS.md).

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
> in `value` (e.g. "Payment method: Binance\nSend to: ...") that the payment-methods editor
> writes with a `Textarea`. In payment forms (`payment-section.tsx` in panel and console)
> it renders as an **info card** (`whitespace-pre-line`), never as input, never
> `required`, and **is not persisted** in `paymentMethodDetails` (forms filter it when
> building details — `subscription-form.tsx` / `platform-subscription-form.tsx`).
> `paymentMethodDetailsSchema` (api-worker) remains `text|file|number`.

// payment-methods.ts (RD-149 — SSOT de métodos de pago sugeridos)
UNIVERSAL_SUGGESTED_PAYMENT_METHODS (Efectivo, Transferencia Bancaria, Tarjeta / Punto de Venta),
COUNTRY_SUGGESTED_PAYMENT_METHODS (VE: Pago Móvil VES, Zelle USD, Binance · CO: Nequi, DaviPlata, PSE, Bre-B, Datáfono COP),
getSuggestedPaymentMethods(countryCode?) → métodos del país + universales sin duplicados (un país puede especializar un universal reusando su `id`); país desconocido/ausente ⇒ solo universales, nunca hereda los de otro país.

> Las sugerencias de métodos de pago viven **solo** en `@workspace/shared`. Panel
> (`activeOrg.countryCode`) y Console (`fitstack_country_code`) consumen
> `getSuggestedPaymentMethods`; ninguna app declara su propia copia del catálogo.

// access-control.ts
platformStatement/platformAc/platformRoles (owner, admin, support),
organizationStatement/organizationAc/organizationRoles (owner/manager/cashier/coach/member),
orgRoleDefinitions, canPlatform(role, module, action),
PlatformStatement, OrganizationStatement,
OrgRole/PlatformRole/OrganizationRole types. Re-exports PERMISSION_MODULES and PERMISSION_ACTIONS.

// auth-config.ts
ORGANIZATION_ADDITIONAL_FIELDS (slogan, countryCode*, taxId, legalName, address, fiscalConfig, timezone*, primaryCurrency*, currencyFormat* — *required)

// permissions/
  modules.ts:         PERMISSION_MODULES (12 modules: dashboard, reports, members, staff,
                      subscriptions, plans, classes, content, settings, organization, ai, panel)
  actions.ts:         PERMISSION_ACTIONS (READ, CREATE, UPDATE, DELETE, ACCESS)
  can.ts:             can(role, module, action), canAny()
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

// errors.ts (RD-127 — frontend error helpers shared by panel and console)
formatApiErrorMessage(data) → string | null   // Zod/API issues → readable Spanish
mutationError(scope, err, fallback)           // logs the error, returns the generic toast text
apiCode(err) → string | undefined             // business code (toasts compare CODE, never text)

// forms.ts
cleanNumericInput(currentValue, newValue)

// date.ts
formatTime(time, format?) / formatTimeRange(start, end?, format?) / TimeFormat / DEFAULT_TIME_FORMAT
// (wall-clock display only; the value is never shifted by a timezone)

// storage.ts
buildMediaUrl(key, r2PublicUrl)   // public → R2 URL; private → authenticated `/api/media`

// exchange-rates.ts
BASE_EXCHANGE_API_URL, EUR_EXCHANGE_URL, USD_EXCHANGE_URL, EUR/USD_EXCHANGE_URL_V4
```

---

## Auth Package (`@workspace/auth`)

```ts
// Entry: @workspace/auth (re-exports client, service + shared constants). Hooks live in two separate entries:
// org (tenant apps) and platform (Console).

// client.ts — createAuthClient with customSession + organization plugin
authClient, useSession, organization
Types: User, Session, SignInParams, SignUpParams

// service.ts — sessionService (works client & server)
sessionService.getSession(headers?) → { data: Session | null, error: IAuthError | null }
sessionService.getServerSession(headers) → { data, error }
sessionService.signIn({ email, password }) → { data, error }
sessionService.signUp({ email, password, name }) → { data, error }

// org.tsx — "use client" (@workspace/auth/org) — tenant side, global for Panel + future tenant apps
useOrgAuth() → { session, user, activeOrganization, orgRole,
                 isOwner, isManager, isCashier, isCoach, isMember,   // identity only, never authorization
                 isPending, error, refetch }
useOrgPermissions() → { can(module, action) }   // thin wrapper over `can` from @workspace/shared

// platform.ts — "use client" (@workspace/auth/platform) — SaaS side, Console only
usePlatformAuth() → { session, user, platformRole, isPending, error, refetch }
// no organization fields; platform authorization goes through canPlatform (console.access/manage)

// env.ts — requireEnvValue(name, rawValue, { buildTimeValue, message? }): single required-env
// resolver (missing value throws visibly; non-production builds warn + build-only placeholder);
// requireApiBaseUrl() builds on it. Each app keeps the literal process.env.NEXT_PUBLIC_* read.
// getServerSession uses ofetch (never native fetch) and maps FetchError → AUTH_API_ERROR/NETWORK_ERROR

// api-client.ts (entry: @workspace/auth/api-client) — HTTP client shared by panel and console
createApiClient({ basePath?, retry?, timeout? })
  → { api, apiBlob }  // cookies on the server (next/headers), credentials in the browser,
                       // Zod/API validation errors formatted into readable strings
ApiFetchOptions<R>, NextFetchConfig
```

---

## Database Schema (33 tables)

### Better Auth Core

`user`, `session`, `account`, `verification`

### Organization & Membership

`organization` (includes: slogan, countryCode (**no DB default**, required at creation), timezone (**notNull**, no default), **primaryCurrency + currencyFormat (`notNull` columns without default — currency derives from country, format comes explicit; never read from settings)**)
`member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)

`platform_plan` (catalog with features as PlanFeatures, price in cents, `currency` — immutable once the plan has payments, no `trial_days`), `platform_subscription` (status computed in SQL — `status` column is legacy; no `is_trial`), `platform_subscription_payment` (invoices with commercial snapshots + `exchange_rate_applied` (plan→paid), **`platform_rate_applied`** `numeric(20,10)` (plan→`platform_setting.primary_currency`) and **`platform_amount`** `bigint` integer cents in that currency; both nullable — `NULL` = historical row whose rate cannot be reproduced, reported as `unconvertedCount`), `ai_usage` (AI credits: `credits` (consumption) + `bonus_credits` (one-off bonus per cycle, via **Give AI Credits** in console), index `idx_ai_usage_org_period`, monthly period per cycle)

> **SaaS billing migrations:** `0030` retires trials (`platform_plan.trial_days` and `platform_subscription.is_trial` dropped; historical trials closed with `cancellation_reason = 'trials_removed'`, their payments converted to `payment_method = 'free'`) and deletes the `platform_setting.allow_price_override` key. `0031` adds `platform_rate_applied`/`platform_amount` and backfills only the reproducible rows (plan already in the primary currency at 1:1; payment already in the primary currency at its `exchange_rate_applied`); every other historical row stays `NULL`, never an invented rate. Both are additive except the two `DROP COLUMN`s, which run after the data normalization.

### Gym Domain

`gym_member` (local profiles, linked to user via userId; **soft delete via `deleted_at` timestamp nullable** — a non-null value hides the member from active views while preserving financial history; `is_active` keeps its independent business "Activo/Inactivo" semantics), `coach_profile` (1:1 extension),
`coach_assignment` (coach ↔ client)

> **Referential safety (migration `0020`):** every FK pointing at `gym_member` — `coach_profile.member_id`, `subscription.member_id`, `payment.member_id`, `biometric_sync_task.member_id`, `workout_session.member_id`, `coach_assignment.coach_member_id`, `coach_assignment.client_member_id` — is `ON DELETE RESTRICT`: a direct hard delete of a member with related data is rejected by the database. `access_control_log.member_id` stays `SET NULL` (legacy). Deleting a member is a soft delete (never a hard delete): `DELETE /api/members/:id` revokes `auth_member` access first, then sets `deleted_at`, and returns `404` when the member does not exist (idempotent on an already-deleted member). Migration `0021` extends the same guard to `subscription.plan_id` → `membership_plan.id` (`ON DELETE RESTRICT`): a plan that has ever been sold cannot be hard-deleted either.

### Memberships & Payments

`membership_plan` (gym product catalog; **soft delete via `deleted_at` timestamp nullable** — a non-null value hides the plan from every panel view and blocks new sales while preserving subscription/payment history and the historical `planName` JOINs. Three independent flags: `deleted_at` is the record lifecycle, `is_active` the draft/published catalog state that governs the picker, and `is_visible_on_site` the public web visibility — none is reused for another. `DELETE /api/plans/:id` sets `deleted_at`, returns `404` when the plan does not exist and `200` (idempotent) when it is already deleted. Migration `0022` adds the two indexes that back the hot plan reads: `idx_membership_plan_org_deleted` (`organization_id`, `deleted_at`) for the listing and `idx_subscription_plan_end` (`plan_id`, `end_date`) for the `includeStats` join and the plan FK check), `subscription` (member ↔ plan, + `end_date_override_reason` nullable — migration `0019`), `payment` (financial audit trail)

### AI / RAG

`ai_usage` (AI credits), `ai_knowledge_document` (KB docs; `organization_id NULL` = platform, set = org), `ai_knowledge_chunk` (chunks with pgvector 1024 dims embedding + HNSW cosine)

### Routines (Fitness)

`exercise`, `routine_template`, `routine_template_item`, `workout_session`, `workout_session_log`

### CMS & Web

`gym_class` (class schedule), `content_page` (includes `metaTitle`/`metaDescription` SEO; canonical derives from slug), `content_block` (blocks by type with display order)

### Settings

`platform_setting`, `gym_setting`
