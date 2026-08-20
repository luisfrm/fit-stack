---
description: Investigate and fix failing typecheck, lint, tests or build errors
agent: debugger
---

Investigate and fix the current failures in this repository:

1. Run `pnpm typecheck` and `pnpm lint` to surface all errors.
2. Run `pnpm test` for the affected package/app if tests are involved.
3. Follow the process: reproduce → isolate (which app/package: `api-worker`, `panel`, `console`, `web`, `shared`, `database`, `auth`) → root cause → minimal fix → verify.
4. Watch for Fit-Stack-specific traps: `process.env` in Workers (use `c.env`), `params`/`searchParams` without `await` in Next.js 15+, `fetch` native in frontends (use `ofetch`), `useSession()` instead of `useAuth()`.
5. Report: root cause → change made → verification result.

Additional context: $ARGUMENTS
