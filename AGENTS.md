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

## Architecture Rules (from `.agents/rules/project-rules.md`)

- Backend: 3-layer strict separation — Route Handler → Service → Repository
- Repository: Drizzle ORM, filter by `organizationId` for multi-tenancy
- UI: Import from `@workspace/ui`, use predefined variants only
- Auth: Better Auth — use `useAuth()` in client, `session-service.ts` on server
- `params`/`searchParams` in Next.js 15+ are **Promises** — use `await`
- Implementation plans in **Spanish** — always ask for explicit approval before implementing

## Database Workflow

1. `db:generate` → Review SQL → `db:migrate`
2. **NEVER** run `db:push` on shared branches (local prototyping only)
3. CI runs `db:check` on PRs automatically

## Key Conventions

- State in URL for shareable/persistent state (pagination, tabs, search)
- Keep `"use client"` at leaf nodes only — default to Server Components
- All mutations: wrap in `try/catch` with `toast.success`/`toast.error`
- Use `router.refresh()` to sync server state after auth/org changes

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

## Role-Based Access Control (RBAC)

Fit-Stack uses **two levels of roles**: Global (platform) and Organization (tenant).

### Organization Roles (`ORG_ROLES`)

Roles are defined in `packages/shared/src/constants.ts`:
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

// In route handler
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

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **No test suite** — `pnpm test` does not exist
- **Implementation plans**: Always use Spanish, ask for explicit approval before implementing
- **Database changes**: Require explicit user approval. `pnpm db:push` is forbidden on shared branches

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

## Key Files to Read First

- `.agents/rules/project-rules.md` — Core architecture rules
- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies