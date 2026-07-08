# Fit-Stack Agent Guide

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
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
cd apps/api      && pnpm dev  # Port 3000
cd apps/cms      && pnpm dev  # Port 3001
cd apps/web      && pnpm dev  # Port 3002
cd apps/console  && pnpm dev  # Port 3003

# Bridge (Python/Flet — managed separately with uv)
cd apps/bridge
uv sync
uv run python main.py
```

## Monorepo Structure

- **Apps**: `api` (Next.js 16, port 3000), `cms` (Next.js 16, port 3001), `web` (Next.js 16, port 3002), `console` (Next.js 16, port 3003), `bridge` (Python/Flet desktop)
- **Packages**: `auth` (Better Auth client/hooks), `ui` (shadcn/ui), `shared` (DTOs/types/constants/permissions), `database` (Drizzle ORM + Neon Postgres), `eslint-config`, `typescript-config`
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
| **Access Control / Bridge** | Desktop app (Flet/Python) for biometric/QR verification at entry. Sync queue + audit logs. |
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
- Components: `StaffTable`, `StaffModal`, `StaffForm` (`apps/cms/components/staff/`)
- Columns: Avatar+Name, Email, Role, Status, Actions
- Service: `membersService` (shared with Members module)

**Trainers (`/dashboard/trainers`):**
- Table view for gym_members with role `COACH` that have a `coach_profile`
- Components: `TrainersTable`, `TrainerModal`, `TrainerForm` (`apps/cms/components/trainers/`)
- Fields: name, photo, specialities, bio, visibility toggle, display order
- Service: `trainersService` (joins gym_member + coach_profile)
- API routes: `/api/trainers`

**Note**: Trainers appear in both views (staff table + trainers table) because they are gym_members with role `COACH`.

### 4. The Bridge App (Hardware Integration)

A Python/Flet desktop application running locally at the gym entrance. Communicates with the API to validate a member's QR/Biometric data against their active subscription, turning "billing data" into "physical access."

**API contract** (authenticated via `x-api-key`):
- `POST /api/access-control/verify` — validate `documentId` + `organizationId`, returns access decision, creates audit log
- `GET /api/access-control/sync-tasks` — poll pending biometric enroll/delete tasks
- `POST /api/access-control/mark-synced` — confirm task completion

**Tables**: `access_control_log` (audit trail of every access attempt), `biometric_sync_task` (queue of sync tasks for devices)

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

### 3. Database Integrity & ORM

- **ORM**: Always Drizzle ORM. All DB code from `@workspace/database`.
- **Workflow**: `generate` → `review` → `migrate`. NO `push`, `generate`, `migrate`, or `seed` without explicit user approval.
- **Push Restriction**: `db:push` is EXCLUSIVELY for local prototyping. Strictly prohibited on shared branches or production.
- **Naming**: Table names are **singular** (`user`, `organization`). Repositories and Services are **plural** (`users.service.ts`).
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
  - `@workspace/auth/client` — raw `authClient`, `useSession`, `useActiveOrganization`, `organization`
  - `@workspace/auth/service` — `sessionService.getSession()` for server components
  - `@workspace/auth/hooks` — `useAuth()` with role flags + `usePermissions()` with `can(module, action)`
- **`apps/cms/lib/auth-client.ts`** and `apps/console/lib/auth-client.ts` — re-export `@workspace/auth/client`
- **`apps/cms/lib/hooks/use-auth.ts`** — re-exports `useAuth` and `usePermissions` from `@workspace/auth/hooks`

**Conventions:**
- Client MUST use `useAuth()`. NEVER use `useSession()` directly or read `session.activeOrganization` directly — use `useActiveOrganization()`.
- For server Components/Layouts/API layers: `sessionService` or server-side `getSession()`.
- **Source of Truth**: The `organization` table (Better Auth) is the sole source for Name/Logo. Use `authClient.organization.update()`.

### 6. Route Handler Pattern (`route-handler.ts`)

API route handlers use centralized wrappers from `apps/api/lib/route-handler.ts` — never write auth/error boilerplate manually.

| Wrapper | When to use | Auth check |
|---------|-------------|------------|
| `withAuth(module, action)` | Org-scoped CRUD routes | Session + orgId + permission check |
| `withSession()` | Org-scoped routes without permission check | Session + orgId only |
| `withPlatformAuth()` | SaaS admin routes (`/api/platform/*`) | Session + global admin role |

```ts
// Before (old pattern — 15+ lines of boilerplate per handler)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return ...
    if (!authorize(session, orgId, MODULE, ACTION)) return ...
    // ... handler logic ...
  } catch (error) { return handleError(error) }
}

// After (new pattern — clean handler only)
export const GET = withAuth(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    // ... handler logic ...
  }
)
```

Params are auto-resolved from Promises — no manual `await params` needed.

For platform/super-admin endpoints that don't use the wrapper pattern, use:
```ts
import { requireGlobalAdmin } from '@/config/auth-utils';
if (!requireGlobalAdmin(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });
```

### 7. Error Handling & Mutations

- **User Feedback**: No silent `console.log()` errors in production. All mutations MUST use `try/catch` with `toast.success`/`toast.error` from explicit server responses.
- **Implementation Plans**: Write in **Spanish**. Always ask for explicit approval before implementing.

---

## Redis Caching (Upstash)

The API uses **Upstash Redis** (`@upstash/redis` v1.37.0) for serverless-compatible caching.

### Setup

- **Client**: `apps/api/lib/redis.ts` — Configures `Redis` with REST URL + token
- **Wrapper**: `apps/api/lib/cache.ts` — Centralized cache abstraction with error handling
- **Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both optional, cache degrades gracefully)

### Cache Methods (`apps/api/lib/cache.ts`)

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

### Cache Invalidation Strategy

- **On writes (POST/PUT/DELETE)**: Invalidate related cache patterns immediately — e.g., creating a subscription invalidates `platform:subscriptions*`, `platform:subscriptions:stats`, and `org:${orgId}:subscription-status`
- **Role invalidation**: `afterUpdateMemberRole` hook in Better Auth invalidates `member:role:${userId}:${orgId}` so role changes take effect instantly
- **Graceful degradation**: All cache methods wrap errors with `console.error` and return `null`/void — Redis being down never blocks requests

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

**Validation flow** (`dashboard/layout.tsx`):
- `SUSPENDED` / `CANCELLED` → redirect to `/no-subscription`
- `PAST_DUE` / `READ_ONLY` → show `<SubscriptionWarningBanner />`
- `ACTIVE` → normal render

**Endpoint**: `GET /api/organizations/subscription-status` (reads org from session)
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

Defined in `packages/shared/src/permissions/matrix.ts` using presets (`NONE`, `READ`, `READ_UPDATE`, `READ_CREATE_UPDATE`, `CRUD`):

| Module | Owner | Manager | Cashier | Coach | Member |
|--------|:-----:|:-------:|:-------:|:-----:|:------:|
| **Dashboard** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Reports** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Members** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Staff** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Subscriptions** | ✅ | ✅ (no delete) | ✅ (no delete) | ❌ | ❌ |
| **Plans** | ✅ | ✅ | ✅ (read) | ❌ | ❌ |
| **Classes** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Content** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Settings** | ✅ (r+w) | ✅ (r+w) | ✅ (read) | ❌ | ❌ |
| **Organization** | ✅ (r+w) | ✅ (r+w) | ❌ | ❌ | ❌ |

### How to Verify Permissions

**In API routes (server-side)**: Use `authorize()` from `apps/api/config/auth-utils.ts`
```ts
import { authorize } from '@/config/auth-utils'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'

if (!await authorize(session, organizationId, PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.READ)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Available helpers** (`apps/api/config/auth-utils.ts`):
- `getActiveOrgId(session)` — Returns `activeOrganizationId` or null
- `getOrgContext(session, organizationId)` — Returns `{ memberRole }` or null
- `authorize(session, orgId, module, action)` — Returns boolean
- `requireGlobalAdmin(session)` — Returns boolean (for SaaS platform routes)
- `authorizeUpload(session, orgId)` — Composite check for upload routes (MEMBERS.CREATE or CONTENT.CREATE)

**In UI (client-side)**: Use `useAuth()` and `usePermissions()` from `@workspace/auth/hooks`
```tsx
import { useAuth, usePermissions } from '@workspace/auth/hooks'
const { isOwner, isManager, isCashier, isCoach, isMember, orgRole } = useAuth()
const { can } = usePermissions()
const canEditClasses = can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)
```

### Anti-escalation

Use `canAssignRole(actor, target)` from `@workspace/shared` to prevent role escalation:
- `OWNER` → can assign any role
- `MANAGER` → cannot assign `OWNER`
- `CASHIER` → can only assign `MEMBER`

### CMS Access Control

Only `OWNER`, `MANAGER`, `CASHIER` can use the CMS app (`apps/cms`):
```ts
import { canAccessCms } from '@workspace/shared'
if (orgRole && !canAccessCms(orgRole)) redirect('/unauthorized')
```

### Security Rules

1. **Never trust client-side role checks** — Always re-verify in API
2. **Session-based authorization** — Use `session.member.role` from Better Auth
3. **Organization scoping** — All queries MUST filter by `organizationId`
4. **No global admin bypass in CMS** — Global roles are for SaaS platform management only

---

## Shared Package Exports (`packages/shared`)

```ts
// Entry point: @workspace/shared
// Re-exports: constants, types, access-control, auth-config, permissions

// constants.ts
GLOBAL_ROLES, ORG_ROLES, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES,
PLATFORM_SUBSCRIPTION_STATUSES, COUNTRIES (8 countries: VE/CO/MX/AR/CL/PE/ES/US),
DEFAULT_COUNTRY, COUNTRY_LIST, ICountryConfig

// types.ts
IUser, ISession, IAuthMember, IOrganization, ICmsClass, IMember, MemberFilter,
PaginatedMembers, IAuthError, TrendDirection, FrequencyType, PlanFeatures, IPlatformOrganization

// access-control.ts
statement, ac, owner/manager/cashier/coach/member (Better Auth org roles), orgRoleDefinitions

// auth-config.ts
ORGANIZATION_ADDITIONAL_FIELDS (slogan, countryCode, taxId, legalName, address, fiscalConfig, timezone, status)

// permissions/
  modules.ts:    PERMISSION_MODULES (10 modules)
  actions.ts:    PERMISSION_ACTIONS (READ, CREATE, UPDATE, DELETE)
  matrix.ts:     ORG_ROLE_PERMISSIONS (owner/manager/cashier/coach/member matrices)
  can.ts:         can(role, module, action), canAny()
  cms-access.ts: CMS_ALLOWED_ORG_ROLES, canAccessCms()
  role-assignment.ts: canAssignRole(actor, target)
```

---

## Auth Package (`@workspace/auth`)

```ts
// Entry: @workspace/auth (re-exports client, service, hooks, permissions + shared constants)

// client.ts — createAuthClient with customSession + organization plugin
authClient, useSession, useActiveOrganization, organization
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
```

---

## Database Schema (28 tables)

### Better Auth Core
`user`, `session`, `account`, `verification`

### Organization & Membership
`organization` (includes: slogan, countryCode, timezone, taxId, legalName, address, fiscalConfig)
`member` (auth_member — Better Auth plugin), `invitation`

### Platform Billing (SaaS)
`fitstack_plan` (plan catalog with features as PlanFeatures), `store_subscription` (org subscriptions),
`platform_payment` (platform invoices)

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
`cms_class`, `cms_page`, `cms_page_block`, `cms_class`

### Settings
`platform_setting`, `gym_setting`

---

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **No test suite** — `pnpm test` does not exist
- **Implementation plans**: Always use Spanish, ask for explicit approval before implementing
- **Database changes**: Require explicit user approval. `pnpm db:push` is forbidden on shared branches
- **Keep AGENTS.md updated** — After any structural change, update AGENTS.md to reflect it. When in doubt, update it.

### When to update AGENTS.md

- New API endpoints or route restructuring (e.g., `/api/platform/settings`)
- Changes to RBAC (new roles, permission matrix changes, new modules)
- New business rules or module changes
- New apps or packages added to the monorepo (e.g., `console`, `auth`)
- Changes to dev commands or database workflow
- New auth patterns or security rules
- New skills or hooks that become project-wide conventions
- New CMS block types or page schema changes
- New Bridge endpoints or device management
- New cache key patterns

---

## Skills Available

Use skill tool for specialized tasks:

| Skill | When to use |
|-------|-------------|
| `brainstorming` | Any creative work or feature creation |
| `python-best-practices` | Python code (Bridge app) |
| `neon-postgres` | Neon database questions |
| `interface-design` | Admin panels, dashboards |
| `copywriting` | Marketing copy changes |
| `vercel-react-best-practices` | React/Next.js performance |
| `next-best-practices` | Next.js route handlers, data fetching, bundling, image optimization |
| `drizzle-orm` | Type-safe SQL ORM operations |
| `better-auth-best-practices` | Better Auth configuration and plugins |
| `organization-best-practices` | Better Auth organizations, members, RBAC |

---

## Key Files to Read First

- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies
- `packages/database/src/schema.ts` — Full DB schema (28 tables)
- `packages/shared/src/permissions/matrix.ts` — RBAC permission matrix
- `apps/api/config/auth.ts` — Better Auth server config
- `apps/api/lib/route-handler.ts` — Route handler wrappers
- `apps/api/proxy.ts` — CORS + session validation middleware
- `packages/auth/src/` — Shared auth client, service, hooks, permissions