---
description: Implement a frontend change following the Next.js 16 + @workspace/ui conventions
agent: frontend-expert
---

Implement the following frontend change following the conventions in `AGENTS.md`:
- **Server first**: default to Server Components; `"use client"` only at leaf nodes.
- **HTTP client**: use the app's `ofetch`-based client (`apps/{panel,console,web}/lib/api/client.ts`). Never `fetch` natively.
- **Auth**: `useAuth()` from `@workspace/auth/hooks` on client; `sessionService.getSession()` on server. Never `useSession()`.
- **UI components**: import exclusively from `@workspace/ui`. No ad-hoc Tailwind overrides for sizes/spacing.
- **URL state**: prefer `?param=value` over `useState` for pagination, tabs, filters.
- **Async params**: `params` and `searchParams` are Promises in Next.js 15+; always `await` them.
- **Types**: live in `@workspace/shared`; never redeclare them in the app.
- **Specify the target app** if relevant: `apps/panel` (gym admin), `apps/console` (SaaS admin), `apps/web` (member portal).

$ARGUMENTS

Verify with `pnpm typecheck` and `pnpm lint` (plus `pnpm test` if logic changed).
