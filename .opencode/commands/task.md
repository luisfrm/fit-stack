---
description: Creates a new task (FS-NNNN) in vaults/tasks/ and optionally generates its plan
---

Create a new task in `vaults/tasks/` from:

$ARGUMENTS

Steps:

1. Check the index in `vaults/tasks/README.md`: if a task already covers this scope, **do not create another** (edit it or warn).
2. Run `pnpm task:new "<short title>"` — it assigns the next `FS-NNNN` and creates `task.md` from `vaults/tasks/_template/task.md` (plus `phases/`).
3. Complete `task.md`: problem, acceptance criteria, scope (table by layer) and `depends_on`. If key information is missing, **ask** before inventing it.
4. Update the task index in `vaults/tasks/README.md`.
5. If the scope is clear, hand planning to the `planner` agent (equivalent to `/plan`) to write `plan.md` + `phases/`.

Rules: **1 task = 1 PR**; branch `feat/FS-NNNN-slug`. **Output language**: your response is in English, but the `task.md` prose you write must be in **Spanish** (keep the frontmatter fields/values in English). Unowned items go to `vaults/backlog/`, they do not open a task on their own.
