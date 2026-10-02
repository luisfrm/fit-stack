---
description: Plans a requirement into a Linear issue, or into a parent with related sub-issues when the work is really several outcomes
agent: planner
---

Plan the following requirement into Linear:

$ARGUMENTS

Hand the whole thing to the `planner` agent, which finds the target issue, explores the code, decides the granularity, writes the description and pushes it.

**Granularity** — the one judgement that matters: if all of it serves a **single outcome**, it is one issue and the phases stay as ordered sections of its description. If it carries **independent outcomes**, each one that can be delivered on its own becomes a sub-issue (`parentId`) under a parent that holds the shared problem. Never split by technical layer, never split just because it feels big.

**Description** in English: `## Problem`, `## Scope` (In / Out), `## Plan` (ordered by dependency, real file paths), `## Acceptance criteria`, `## Verification`, `## Risks`.

Ask before assuming anything material. If a closed issue already covers the scope, report that instead of planning it again.
