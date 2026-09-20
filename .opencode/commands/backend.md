---
description: Implement a backend change in api-worker following the Hono/Drizzle layer conventions
agent: backend-expert
---

Implement the following backend change in `apps/api-worker` following the layer conventions in `AGENTS.md`:

- Route Handler (HTTP only) → Service (business logic) → Repository (Drizzle queries only)
- Factory pattern: `createXRepository(db)` + `createXService(repo, ...deps)`. DB via `createDb(c.env.DATABASE_URL)`.
- Middleware: `requireOrgPermission(module, action)` or `requirePlatformPermission()` — never manual auth boilerplate.
- Multi-tenancy: filter every query by `organizationId` from `c.get('session')!.activeOrganizationId!`.
- Validation: `zValidator('json', schema)` from `@hono/zod-validator`.
- No `pgEnum` and no `.$type<...>()`: use plain `text('col')` in Drizzle. Allowed values are validated by Zod in the route handler and the frontend; the DB treats them as plain text.
- If a DB schema change is needed: present the migration plan before running `pnpm db:generate` / `pnpm db:migrate`.

$ARGUMENTS

Verify with `pnpm typecheck` and `pnpm lint`. If DB migrations are involved, run `pnpm db:check` first.
