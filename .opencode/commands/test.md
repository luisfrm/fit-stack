---
description: Write Vitest tests for the current changes
agent: test-writer
---

Write tests for the current changes following Fit-Stack conventions:

- **`apps/api-worker/` (Vitest)**: unit tests for services and repositories using Drizzle mocks (`vi.mock`). Test business rules (multi-tenancy, Cumulative Expiration, atomic payments). Cover expected errors (404, 403, 400). Test behavior, not implementation details.
- **`packages/shared/` (Vitest)**: unit tests for RBAC helpers (`can(module, action)`), DTOs, and constants.
- **`apps/panel/`, `apps/console/`, `apps/web/` (Vitest + RTL)**: unit tests for utilities and components. Use accessible queries (roles/labels). Mock the `api` ofetch client and `useAuth()` — never depend on a real session.

Conventions: `*.test.ts` / `*.test.tsx` alongside the file. `describe` → `it` with behavior-focused names. No brittle snapshots.

After writing, run `pnpm test` for the affected package. If something fails, fix it or explain why it does not apply.

Focus: $ARGUMENTS
