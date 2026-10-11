> **Alcance:** RBAC de dos niveles (plataforma + organización): roles, matriz de permisos, anti-escalación y reglas de seguridad.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

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
5. **Uploads: two routes, a single authority per case** — The panel uploads via `/api/upload/*` with the org from **its own session** (`requireOrgPermission(MEMBERS, CREATE)`): `organizationId` does not exist in the contract, so no member can write to another gym's folder. The console (which does NOT have an active org) uploads via `/api/platform/organizations/:orgId/upload/*` with the org by **path** and `requirePlatformAuth` (admin/owner; `support` → 403) or via `/api/platform/upload/*` for branding. Every written/deleted key must start with `<orgId>/` (or `platform/branding/`); public reading lives at `/api/public/files/*` and only serves `<orgId>/cms/…` and `platform/branding/…`.
