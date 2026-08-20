---
description: Scaffold a complete new feature end-to-end (api-worker + frontend) following Fit-Stack conventions
---

Scaffold the new feature `$ARGUMENTS` following the conventions in `AGENTS.md`. Use the planner agent first if the scope is large.

**Backend (`apps/api-worker/src/features/<name>/`):**
1. Create `repository.ts` — Drizzle queries only, factory `createXRepository(db)`, always filter by `organizationId`.
2. Create `service.ts` — business logic only, factory `createXService(repo, ...deps)`.
3. Create `router.ts` — Hono router, HTTP only. Use `requireOrgPermission(module, action)` middleware. Validate bodies with `zValidator('json', schema)`.
4. Wire the router into `apps/api-worker/src/index.ts`.
5. Add types/DTOs to `packages/shared/src/` if consumed by multiple apps.

**Database (if a new table is needed):**
1. Add the schema in `packages/database/src/schema/`.
2. Run `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate` (only with user approval).
3. No `pgEnum` y no `.$type<...>()` — usa `text('col')` plano. Los valores permitidos los valida Zod en el backend y el frontend.
4. Add `organizationId` FK + index to every tenant-scoped table.

**Frontend (target `apps/panel`, `apps/console`, or `apps/web`):**
1. Add API call via the app's `lib/api/client.ts` (`api()` with `ofetch` — never `fetch` natively).
2. Create UI components importing only from `@workspace/ui`.
3. Default to Server Components; `"use client"` only at leaf nodes.
4. Auth: `useAuth()` on client, `sessionService.getSession()` on server. Never `useSession()`.

**Cache (if applicable):**
- Add cache `get`/`set` in the service using `createCache(env)`.
- Invalidate with `cache.invalidate('org:${orgId}:<feature>*')` on writes.

**Jobs (if emails/PDFs are involved):**
- Produce a `FitTaskEvent` in `c.env.TASK_QUEUE.send(...)` with the correct `type` and `payload`.

Report what was created and how to verify (`pnpm typecheck`, `pnpm lint`, `pnpm test`).
