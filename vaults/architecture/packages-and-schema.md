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

`platform_plan` (catalog with features as PlanFeatures, price in cents), `platform_subscription` (status computed in SQL — `status` column is legacy), `platform_subscription_payment` (invoices with commercial snapshots), `ai_usage` (AI credits: `credits` (consumption) + `bonus_credits` (one-off bonus per cycle, via **Give AI Credits** in console) + `count` legacy, index `idx_ai_usage_org_period`, monthly period per cycle)

### Gym Domain

`gym_member` (local profiles, linked to user via userId), `coach_profile` (1:1 extension),
`coach_assignment` (coach ↔ client)

### Memberships & Payments

`membership_plan` (gym product catalog), `subscription` (member ↔ plan, + `end_date_override_reason` nullable — migration `0019`), `payment` (financial audit trail)

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
