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
- **Client Side**: Always use the custom `useAuth()` hook. It wraps Better Auth and adds critical role-based flags (e.g., `isAdmin`).
- **Never Direct**: Do not use `useSession()` from the native library directly—you’ll miss out on the Fit-Stack specific enhancements.
- **Active Context**: Use `useActiveOrganization()` to ensure the UI is always correctly scoped.

## 3. Server-Side Validation
- **Service Layer**: Use `session-service.ts` in API layers and Server Components to fetch session data securely.
- **Multi-tenancy Check**: The backend must never trust the user role provided by the client. Always verify permissions against the server-side organization role.

## 4. Permission Hierarchy
Fit-Stack uses a defined role system:
- **Owner**: Full system control.
- **Admin**: Full organization control.
- **Cashier**: Can manage payments and members, but cannot modify critical settings.
- **Member**: Access to personal training data only.
