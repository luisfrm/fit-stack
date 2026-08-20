---
description: Create a new Drizzle ORM migration following the Fit-Stack workflow
agent: database-expert
---

Create a new Drizzle ORM migration following the repo workflow:

1. Add or modify the schema in `packages/database/src/schema/`.
   - No `pgEnum` y no `.$type<...>()`: columnas `text('col')` planas. Los valores permitidos los valida Zod (backend) y el frontend; la DB almacena texto puro sin restricción.
   - Every tenant table must have `organizationId` with FK + index.
   - Add indexes for FK columns and any columns used in frequent filters/sorts.
2. Run `pnpm db:check` to verify schema consistency.
3. Run `pnpm db:generate` to generate the migration SQL — review the output carefully.
4. Present the generated SQL to the user for approval **before** running `pnpm db:migrate`.
5. After approval, run `pnpm db:migrate`.

> ⚠️ `pnpm db:push` is ONLY for local prototyping. Never on shared branches or production.

Context for the migration: $ARGUMENTS
