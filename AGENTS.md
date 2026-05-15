# Fit-Stack Agent Guide

## Dev Commands

```bash
# Root (Turbo monorepo)
pnpm build        # Build all apps
pnpm dev          # Run all dev servers
pnpm lint         # Lint all apps
pnpm typecheck    # Type-check all apps
pnpm format      # Format code (Prettier)

# Database (Drizzle ORM)
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema (LOCAL ONLY - never on shared branches)
pnpm db:check     # Verify schema
pnpm db:studio    # Open DB studio

# Individual apps
cd apps/web && pnpm dev  # Port 3002
cd apps/api && pnpm dev  # Port 3000
cd apps/cms && pnpm dev  # Port 3001
```

## Monorepo Structure

- **Apps**: `api` (Next.js 16), `cms` (Next.js 16), `web` (Next.js 16), `bridge` (Python/Flet desktop)
- **Packages**: `ui` (shadcn/ui components), `shared` (shared types/DTOs), `database` (Drizzle ORM + Neon Postgres)
- **Bridge is Python** - not part of Turbo, managed separately with `uv`

## Architecture Rules (from `.agents/rules/project-rules.md`)

- Backend: 3-layer strict separation — Route Handler → Service → Repository
- Repository: Drizzle ORM, filter by `organizationId` for multi-tenancy
- UI: Import from `@workspace/ui`, use predefined variants only
- Auth: Better Auth — use `useAuth()` in client, `session-service.ts` on server
- `params`/`searchParams` in Next.js 15+ are **Promises** — use `await`
- Implementation plans in **Spanish** — always ask for explicit approval before implementing

## Database Workflow

1. `db:generate` → Review SQL → `db:migrate`
2. **NEVER** run `db:push` on shared branches (local prototyping only)
3. CI runs `db:check` on PRs automatically

## Key Conventions

- State in URL for shareable/persistent state (pagination, tabs, search)
- Keep `"use client"` at leaf nodes only — default to Server Components
- All mutations: wrap in `try/catch` with `toast.success`/`toast.error`
- Use `router.refresh()` to sync server state after auth/org changes

## Important Constraints

- **Never auto-commit** — Always let the user review and commit manually. The user owns their git history.
- **No test suite** — `pnpm test` does not exist
- **Implementation plans**: Always use Spanish, ask for explicit approval before implementing
- **Database changes**: Require explicit user approval. `pnpm db:push` is forbidden on shared branches

## Skills Available

Use skill tool for specialized tasks:

| Skill | When to use |
|-------|-------------|
| `brainstorming` | Any creative work or feature creation |
| `python-best-practices` | Python code (Bridge app) |
| `neon-postgres` | Neon database questions |
| `interface-design` | Admin panels, dashboards |
| `copywriting` | Marketing copy changes |
| `vercel-react-best-practices` | React/Next.js performance |

## Key Files to Read First

- `.agents/rules/project-rules.md` — Core architecture rules
- `apps/*/package.json` — App-specific scripts
- `packages/*/package.json` — Package dependencies