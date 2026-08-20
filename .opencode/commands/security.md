---
description: Audit security of the current changes or the whole repo
agent: security
---

Audit the security of this repository — focus on the current uncommitted changes, or the whole codebase if there are none.

Follow the Fit-Stack security checklist:
- **Multi-tenancy**: every query filters by `organizationId` (critical #1).
- **Auth middleware**: correct middleware on every route (`requireOrgPermission`, `requirePlatformPermission`, `requirePlatformAuth`).
- **CORS**: allowlist hardcoded in `apps/api-worker/src/lib/cors.ts` — production must not allow `localhost:*`.
- **Secrets**: no hardcoded keys/tokens; all secrets in Workers secrets or env vars; no sensitive data in `NEXT_PUBLIC_*`.
- **R2**: presigned URL expiration, upload routes validate `organizationId` before allowing write/delete.
- **Validation**: `zValidator` on all mutation endpoints; no raw user input in Drizzle queries.
- **Session cache**: user session data must never be cached. Only org catalog data with proper TTL.
- **Jobs payloads**: `FitTaskEvent` consumers must validate before processing.

Report findings by severity (🔴 crítico → ⚪ bajo) with `archivo:línea`, impact, and proposed patch.

Scope / focus: $ARGUMENTS
