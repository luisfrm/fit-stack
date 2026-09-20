---
description: Review current changes with the code reviewer agent
agent: reviewer
---

Review the current changes in this repository (the uncommitted diff, or the scope given below).

- Inspect the diff with `git diff` and `git status` and read the surrounding code to understand intent and contract.
- Checklist: layer violations (business logic in route handlers), missing `organizationId` filters (multi-tenancy), wrong or missing auth middleware, `process.env` in Workers code, `fetch` native in frontends, `useSession()` instead of `useAuth()`, `params` without `await` in Next.js 15+.
- Report findings by severity (🔴 Critical → ⚪ Low) with `file:line` and a concrete suggestion.
- Close with a verdict: **approved** / **approved with changes** / **needs changes**.

Scope / focus: $ARGUMENTS
