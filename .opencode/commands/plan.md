---
description: Breaks a requirement into actionable phases inside vaults/tasks/ (FS-NNNN system)
agent: planner
---

Break the following requirement into an execution plan inside `vaults/tasks/`:

$ARGUMENTS

Flow:

1. **Locate or create the task.** If the requirement maps to an existing task (`vaults/tasks/FS-NNNN-slug/`), work on its `task.md`. If it is a new scope, create it with `pnpm task:new "<title>"` (see `vaults/tasks/README.md`).
2. **Write `plan.md`** in the task folder, ordered by dependency layers:
   1. DB schema (Drizzle) → `pnpm db:generate` → review → `pnpm db:migrate`
   2. Backend: repository → service → router → types in `@workspace/shared`
   3. Frontend: API client → components (`@workspace/ui`) → integration
   4. Cache: Upstash patterns + invalidation on writes (if applicable)
   5. Jobs: `FitTaskEvent` contract (if emails/PDFs are involved)
   6. Tests: Vitest unit + integration
   7. Docs: the affected doc (`vaults/backlog/`, `AGENTS.md`, …)
3. **Create `phases/*.md`** (one per phase) and update `phases/README.md` with the index and inter-phase dependencies.
4. Each phase must include: files it touches, "done" criterion and verification command (`pnpm typecheck`, `pnpm lint`, `pnpm test`).

**Output language**: your response is in English, but every file written under `vaults/` (`plan.md`, `phases/*.md`) must be in **Spanish**. `docs/PENDING.md` does not exist: unowned pending work goes to `vaults/backlog/`. Respect `AGENTS.md` (layers, no `pgEnum`, factory pattern, ofetch, `useAuth()`).
