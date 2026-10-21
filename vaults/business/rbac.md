> **Alcance:** RBAC de dos niveles (plataforma + organización): roles, matriz de permisos, anti-escalación y reglas de seguridad.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Role-Based Access Control (RBAC)

Fit-Stack uses **two levels of roles**: Platform (SaaS) and Organization (tenant).

### Platform Roles

Platform roles for Better Auth admin plugin (`platformRoles` in `packages/shared/src/access-control.ts`): `owner`, `admin`, `support` (+ `user` as Better Auth default, no role in `platformRoles`). The `user.role` field stores this platform role.

**Console access gate**: `canPlatform(role, 'console', 'access')` — `true` for `owner`, `admin` and `support`; plain `user` is denied. The Console layout and `/unauthorized` both use it.

**Console write gate**: `canPlatform(role, 'console', 'manage')` — only `owner`/`admin`. Read routes use their own module (`organization:list`, `plan:list`, `subscription:list`, `user:list`, `setting:read`); settings, branding and knowledge mutations use `setting:write`. `support` is read-only. No hardcoded role comparisons.

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

**In UI (client-side)**: `useOrgAuth()` (identity) and `useOrgPermissions()` (authorization) from `@workspace/auth/org`; `usePlatformAuth()` from `@workspace/auth/platform` in the Console.

```tsx
import { useOrgAuth, useOrgPermissions } from "@workspace/auth/org";
const { isOwner, isManager, isCashier, isCoach, isMember, orgRole } = useOrgAuth();
const { can } = useOrgPermissions();
const canEditClasses = can(
  PERMISSION_MODULES.CLASSES,
  PERMISSION_ACTIONS.UPDATE,
);
```

> **Identity vs authorization.** The role flags (`isOwner`, `isManager`, …) describe
> WHO the user is and are only for labels/badges/conditional copy. They must NEVER
> gate a route, a module or a button: that always goes through `can(module, action)`
> (or `can(role, module, action)` on the server), the single implementation of
> the matrix. Gating with flags duplicates the matrix and lets the two drift.
>
> **Platform vs organization.** `@workspace/auth/org` exposes the tenant side
> (`activeOrganization`, `orgRole`, flags, `can`) and is global for the Panel and
> future tenant apps. `@workspace/auth/platform` exposes the SaaS side
> (`user`, `platformRole`) for the Console. Neither returns the other's fields.

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
// Server (layout): can()
can(orgRole, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)

// Client: useOrgPermissions().can(PANEL, ACCESS)
```

The panel layout (`apps/panel/app/(protected)/layout.tsx`) redirects to `/unauthorized`
when the check fails. No role list is hardcoded anywhere: adding a role with panel
access is a one-line change in `organizationRoles`.

### Security Rules

1. **Never trust client-side role checks** — Always re-verify in API
2. **Session-based authorization** — Use `session.member.role` from Better Auth
3. **Organization scoping** — All queries MUST filter by `organizationId`
4. **No platform admin bypass in CMS** — Platform roles are for SaaS platform management only
5. **Uploads: two routes, a single authority per case** — The panel uploads via `/api/upload/*` with the org from **its own session** (`requireOrgPermission(MEMBERS, CREATE)`): `organizationId` does not exist in the contract, so no member can write to another gym's folder. The console (which does NOT have an active org) uploads via `/api/platform/organizations/:orgId/upload/*` with the org by **path** and `requirePlatformPermission('console','manage')` (admin/owner; `support` → 403) or via `/api/platform/upload/*` for branding (`setting:write`). Every written/deleted key must start with `<orgId>/` (or `platform/branding/`); public reading lives at `/api/public/files/*` and only serves `<orgId>/cms/…` and `platform/branding/…`.
