---
name: best-practices-security
description: Authentication standards, Better Auth integration, and session security.
---

# Security & Authentication

Protect user data and ensure secure access across all organizations with our Better Auth implementation.

## 1. Identity Source of Truth

- **Organization Identity**: The `organization` table (handled by Better Auth) is the only source for Name and Logo. Never fallback to legacy settings tables for core identity.
- **Client Sync**: To update organization info, use `authClient.organization.update()`.

## 2. Secure Auth Hooks

- **Client Side**: Always use the custom `useAuth()` hook from `@/lib/hooks/use-auth`. It wraps Better Auth and adds critical role-based flags (e.g., `isOwner`, `isManager`, `isCashier`, `isCoach`, `isMember`).
- **Never Direct**: Do not use `useSession()` from the native library directly — you'll miss out on the Fit-Stack specific enhancements.
- **Active Context**: Use `useActiveOrganization()` to ensure the UI is always correctly scoped.

## 3. Server-Side Validation

- **Service Layer**: Use `session-service.ts` in API layers and Server Components to fetch session data securely.
- **Multi-tenancy Check**: The backend must never trust the user role provided by the client. Always verify permissions against the server-side organization role using auth-utils helpers.
- **Role Helpers**: Import from `@/config/auth-utils` — `canManageMembers`, `canReadMembers`, `canManagePayments`, etc.

## 4. Permission Hierarchy

Fit-Stack uses **organization-level roles** only in the CMS (no global admin bypass for business endpoints).

| Role | Description |
|------|-------------|
| **Owner** | Full system control. Can manage organization settings, members, staff, classes, payments, and subscriptions. |
| **Manager** | Operational admin. Can manage organization settings, members, staff, classes, and payments. Cannot cancel subscriptions. |
| **Cashier** | Staff role. Can manage members (create/edit), register and change payment status, manage classes. Cannot edit settings. |
| **Coach** | Trainer role. Can view members, manage routines (create/edit), view classes. Cannot create members or manage payments. |
| **Member** | Gym client. Limited access to their own data only. Not applicable in CMS context. |

### Helper Functions

```ts
// apps/api/config/auth-utils.ts
canManageOrganization(session, orgId)  // Owner, Manager
canManageMembers(session, orgId)      // Owner, Manager, Cashier
canReadMembers(session, orgId)        // Owner, Manager, Cashier, Coach
canManageClasses(session, orgId)      // Owner, Manager, Cashier
canManageRoutines(session, orgId)     // Owner, Manager, Coach
canManagePayments(session, orgId)      // Owner, Manager, Cashier
canManageSettings(session, orgId)     // Owner, Manager
```

## 5. Security Rules

1. **Never trust client-side role checks** — Always re-verify permissions in API routes
2. **Session-based authorization** — Use `session.member.role` from Better Auth organization plugin
3. **Organization scoping** — All repository queries MUST filter by `organizationId`
4. **No global admin bypass in CMS** — Global roles (`admin`) are for SaaS platform management in Console only
5. **Invitation role validation** — When creating invitations, validate that the role is a valid `ORG_ROLES` value