---
description: Turns a requirement into one self-contained Linear issue (spec + acceptance criteria + branch) ready to implement as a single PR
agent: planner
---

Plan the following requirement as a Linear issue:

$ARGUMENTS

Flow:

1. **Resolve the target issue.** If `$ARGUMENTS` is an issue identifier (`RD-89`), plan into that issue and update it. Otherwise, check with `list_issues` whether an open issue already covers the scope — if it does, plan into it instead of duplicating. Only create a new issue when the scope is genuinely new. Planning is delegated to the `planner` agent, which owns the whole flow: explore the code, decide granularity (1 issue, or split into sibling issues linked with `blocks`/`blockedBy` when one PR would be unreviewable), write the spec and push it to Linear.
2. **The spec** is the issue description, in English, with these sections: `## Problem`, `## Scope` (In / Out), `## Implementation plan` (ordered by layer — DB, Shared, Backend, Frontend, Cache, Jobs, Tests, Docs — only the layers actually touched, each with real file paths), `## Acceptance criteria` (checklist), `## Verification` (`pnpm typecheck`, `pnpm lint`, `pnpm test`, integration when contracts/payments change, plus manual steps), `## Risks & notes`, `## Git` (branch).
3. **Metadata**: team `Rivas Digital`, state `Backlog`, a priority with a reason, and one label — `Feature` (`feat/`), `Bug` (`fix/`) or `Improvement` (`chore/`).
4. **Branch**: `<type>/RD-<number>-<kebab-brief-summary>`, recorded in the `## Git` section.

Rules: **1 issue = 1 PR**. A rejected PR sends the same issue back to `In Progress`; never open a duplicate issue. There are no phases and no sub-issues per layer. The local `vaults/tasks/` system and `pnpm task:new` no longer exist — work is referenced by its Linear id. Respect `AGENTS.md` (3-layer separation, no `pgEnum`, factory pattern, `ofetch`, `useAuth()`, money in integer cents). Ask before assuming anything material.
