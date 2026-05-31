# Fit-Stack Agent Guide

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm format      # Format code (Prettier)

# Database (Drizzle ORM)
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema (LOCAL ONLY - never on shared branches)
pnpm db:check     # Verify schema
pnpm db:studio    # Open DB studio

# Individual apps
cd apps/web && pnpm dev  # Port 3002
cd apps/api && pnpm dev  # Port 3000
cd apps/cms && pnpm dev  # Port 3001
```

## Monorepo Structure

- **Apps**: `api` (Next.js 16), `cms` (Next.js 16), `web` (Next.js 16), `bridge` (Python/Flet desktop)
- **Packages**: `ui` (shadcn/ui components), `shared` (shared types/DTOs), `database` (Drizzle ORM + Neon Postgres)
- **Bridge is Python** - not part of Turbo, managed separately with `uv`

---

## Project Context (Business Overview)

### 1. Vision

Fit-Stack is a multi-tenant SaaS for the Gym and Fitness industry, primarily serving the Venezuelan market. It solves the complexity of multi-currency billing, member retention, and automated physical access control.

- **Multi-tenancy**: Every gym is an `Organization`. Data isolation strictly enforced via `organizationId`.
- **B2B SaaS Model**: "Platform" layer (SaaS Admins) + "CMS" layer (Gym Admins).

### 2. Module Breakdown

| Module | Purpose |
|--------|---------|
| **Members** | Centralized identity for gym clients. Tracks historical behavior and preferences. |
| **Membership Plans** | Commercial product catalog. Defines durations (Daily, Weekly, Monthly) and precise pricing in a configurable base currency (USD by default). |
| **Subscriptions** | Temporal access control linking a Member to a Plan. Uses **Cumulative Expiration Logic** — renewing adds time to the current end date so no paid day is lost. |
| **Payments** | Financial audit trail. Captures dynamic metadata (bank hashes, reference numbers, screenshots) for manual transfer validation. Prevents duplicate registrations while a payment is `processing`. |
| **Platform (Super Admin)** | SaaS lifecycle management. Create gyms (Organizations), manage tiers, monitor system health. |
| **Staff & Trainers** | HR and operations separation. Distinguishes business managers (Staff) from service deliverers (Trainers). |
| **Classes** | Group activity scheduling (Crossfit, Yoga, etc.) with attendance tracking and capacity management. |
| **Content** | Dynamic UI communication. Admins update dashboard sections without code changes. |
| **Settings** | Localization and branding per gym (Timezone, currency formats, colors/logos via dynamic OKLCH injection). |

### 3. Staff & Trainers Architecture

**Data model:**
- `gym_member` (base table) — all gym members: clients, staff, trainers
- `coach_profile` (extension) — optional 1:1 extension for gym_members with role `COACH`. Fields: `specialities`, `bio`, `isVisible`, `displayOrder`
- `auth_member` — Better Auth membership linking user ↔ organization with role (`OWNER`, `MANAGER`, `CASHIER`, `COACH`, `MEMBER`)

**Staff (`/dashboard/staff`):**
- Table view for gym_members with roles: Owner, Manager, Cashier, Coach
- Component: `StaffTable` (`apps/cms/components/staff/staff-table.tsx`)
- Modal: `StaffModal` (`apps/cms/components/staff/staff-modal.tsx`)
- Columns: Avatar+Name, Email, Role, Status, Actions
- Service: `membersService` (shared with Members module)

**Trainers (`/dashboard/trainers`):**
- Card grid view for gym_members with role `COACH` that have a `coach_profile`
- Component: `CoachCard`, `TrainerModal` (under `apps/cms/components/coaches/`)
- Fields: name, photo, specialities, bio, visibility toggle, display order
- Service: `coachesService` (joins gym_member + coach_profile)
- API routes: `/api/coaches`

**Note**: Coaches appear in both views (staff table + trainers grid) because they are gym_members with role `COACH`.

### 5. The Bridge App (Hardware Integration)

A Python/Flet desktop application running locally at the gym entrance. Communicates with the API to validate a member's QR/Biometric data against their active subscription, turning "billing data" into "physical access."

### 6. Business Rules Summary

1. **Multi-currency**: System thinks in a base currency (USD by default) but allows payment in any active local currency via real-time exchange rates. Both base currency and active currencies are managed dynamically in **Settings**.
2. **Atomic Invoicing**: Subscriptions and Payments are created as an atomic unit to ensure financial and temporal data never desync.
3. **Strict Isolation**: No gym sees another gym's data. Everything scoped to `activeOrganizationId` in the session.
4. **Cumulative Expiration**: Renewing a subscription extends from the current `periodEnd` (not today), preserving all paid days.

---

## Project Rules (Technical Standards)

### 1. Monorepo Architecture & Boundaries

- **Package Separation**: Respect boundaries between `apps/` and `packages/`. Logic belonging to a package MUST NEVER be duplicated in an app.
- **Strict Isolation**: Don't mix API and Frontend contexts. Never import anything between apps directly; the only allowed interaction is through shared packages (`packages/shared`).
- **Shared Logic & Types**: Use `@workspace/shared` for interfaces, DTOs, or constants shared between backend, frontend, or other consumers.
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
- **Proxy/Middleware**: Keep heavy logic out of middleware. Use solely for CORS, header manipulation, and early session validation.

### 5. Security & Authentication Architecture

- **Source of Truth**: The `organization` table (Better Auth) is the sole source for Name/Logo. Use `authClient.organization.update()`.
- **Layered Structure**:
  - **Config (`auth-client.ts`)**: Setup and native exports.
  - **Client Hook (`use-auth.ts`)**: Wraps native hooks with role flags. Client MUST use `useAuth()`. NEVER use `useSession()` directly or read `session.activeOrganization` directly — use `useActiveOrganization()`.
  - **Server Service (`session-service.ts`)**: For Server Components, Layouts, and API layers.
- **Auth Library**: Better Auth — `useAuth()` on client, `session-service.ts` on server.

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
| `org:${orgId}:public:page:*` | 5 min | Public page slugs |
| `org:${orgId}:subscription-status` | 1 min | Org billing status |
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

### Organization Roles

Roles defined in `packages/shared/src/constants.ts`:
```ts
ORG_ROLES = {
  OWNER: "owner",     // Super Admin / Creator - total control
  MANAGER: "manager", // Gym Owner/Manager - full tenant control
  CASHIER: "cashier", // Staff/Cashier - payments and check-ins
  COACH: "coach",     // Trainer - routines and athlete progress
  MEMBER: "member",   // Gym client - app access to their own data
}
```

### Permission Matrix

| Action | Owner | Manager | Cashier | Coach | Member |
|--------|:-----:|:-------:|:-------:|:-----:|:------:|
| **Members** |
| View list | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create/Edit/Delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Payments** |
| View/Register | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change status (validate/void) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Subscriptions** |
| Create | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cancel | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Classes** |
| View | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/Edit/Delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Routines** |
| View | ✅ | ✅ | ✅ | ✅ | ❌ (own only) |
| Create/Edit | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Settings** |
| View/Edit | ✅ | ✅ | ❌ | ❌ | ❌ |

### How to Verify Permissions

**In API routes (server-side)**: Use auth-utils helpers from `@/config/auth-utils`
```ts
import { canManageMembers, canReadMembers, canManagePayments } from '@/config/auth-utils'

if (!canReadMembers(session, organizationId)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Available helpers** (`apps/api/config/auth-utils.ts`):
- `canManageOrganization` — Org settings (name, logo, plan)
- `canManageMembers` — Create, update, delete gym_member records
- `canReadMembers` — List/View members (includes Coach)
- `canManageClasses` — Create, update, delete classes
- `canManageRoutines` — Create, update, delete routines
- `canManagePayments` — Register and manage payments
- `canManageSettings` — Gym settings (billing, payment methods, currencies)

**In UI (client-side)**: Use `useAuth()` hook from `@/lib/hooks/use-auth`
```tsx
const { isOwner, isManager, isCashier, isCoach, isMember, orgRole } = useAuth()
```

### Security Rules

1. **Never trust client-side role checks** — Always re-verify in API
2. **Session-based authorization** — Use `session.member.role` from Better Auth
3. **Organization scoping** — All queries MUST filter by `organizationId`
4. **No global admin bypass in CMS** — Global roles are for SaaS platform management only

---

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **No test suite** — `pnpm test` does not exist
- **Implementation plans**: Always use Spanish, ask for explicit approval before implementing
- **Database changes**: Require explicit user approval. `pnpm db:push` is forbidden on shared branches
- **Keep AGENTS.md updated** — After any structural change, update AGENTS.md to reflect it. When in doubt, update it.

### When to update AGENTS.md

- New API endpoints or route restructuring (e.g., `/api/platform/settings`)
- Changes to RBAC (new roles, permission matrix changes)
- New business rules or module changes
- New apps or packages added to the monorepo
- Changes to dev commands or database workflow
- New auth patterns or security rules
- New skills or hooks that become project-wide conventions

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

---

## Key Files to Read First

- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies
