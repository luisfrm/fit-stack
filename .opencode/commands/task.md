---
description: Captures a new requirement as a Linear issue and optionally plans it in the same step
---

Capture the following as a Linear issue:

$ARGUMENTS

Steps:

1. **Check for an existing issue.** Search Linear (`list_issues`) for the scope. If an open issue already covers it, plan into it instead of creating a duplicate; if a Done issue covers it, report that and stop.
2. **Create the issue** in team `Rivas Digital` with `save_issue`: a short, concrete title (the problem, not the solution), state `Backlog`, a priority, and one label — `Feature`, `Bug` or `Improvement`.
3. **Fill the requirement sections** in the description: `## Problem` (what and why, in 2–5 sentences) and `## Scope` with **In** / **Out**. If key information is missing, **ask** before inventing it.
4. **Hand planning to the `planner` agent** (same as `/plan`) to complete `## Implementation plan`, `## Acceptance criteria`, `## Verification`, `## Risks & notes` and `## Git` in that same issue.
5. **Report** the identifier, the URL and the branch name.

Rules: **1 issue = 1 PR**, branch `<type>/RD-<number>-<kebab-brief-summary>`. No phases, no sub-issues per layer. The local `vaults/tasks/` system (`FS-NNNN`, `plan.md`, `phases/`) is deprecated — never write there; unowned pending ideas stay in `vaults/backlog/` until they have an owner and a scope. Linear content is written in **English**; the chat response is in **Spanish**.
