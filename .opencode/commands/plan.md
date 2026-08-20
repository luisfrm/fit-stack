---
description: Break a feature into actionable tasks updating docs/PENDING.md
agent: planner
---

Break the following request into actionable tasks respecting the Fit-Stack architecture (`AGENTS.md`):

$ARGUMENTS

Order the tasks by dependency layer:
1. DB schema (Drizzle) → `pnpm db:generate` → review → `pnpm db:migrate`
2. Backend: repository → service → router → types in `@workspace/shared`
3. Frontend: API client call → components (`@workspace/ui`) → integration
4. Cache: Upstash patterns + invalidation on writes (if applicable)
5. Jobs: `FitTaskEvent` contract (if emails/PDFs are involved)
6. Tests: Vitest unit + integration
7. Docs: update `docs/PENDING.md`

Each task must include: files to touch, done criterion, and verification command (`pnpm typecheck`, `pnpm lint`, `pnpm test`). Update `docs/PENDING.md` in the existing format.
