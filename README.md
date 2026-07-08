# Fit-Stack

Multi-tenant SaaS platform for the gym & fitness industry, primarily serving the Venezuelan market. Solves multi-currency billing, member retention, and automated physical access control.

> **Status:** Active development.

---

## Overview

Fit-Stack is composed of **5 applications** + **6 shared packages** in a single pnpm/Turbo monorepo.

### Applications

| App | Stack | Port | Purpose |
|-----|-------|:----:|---------|
| `api` | Next.js 16 (REST API) | 3000 | All HTTP endpoints (Better Auth + Drizzle ORM) |
| `cms` | Next.js 16 (App) | 3001 | Gym admin panel (Owner/Manager/Cashier) |
| `web` | Next.js 16 (App) | 3002 | Public marketing + CMS pages |
| `console` | Next.js 16 (App) | 3003 | SaaS super-admin (organizations, plans, subs) |
| `bridge` | Python/Flet | — | Desktop kiosk for biometric/QR access control |

### Packages

| Package | Purpose |
|---------|---------|
| `@workspace/auth` | Shared Better Auth client, hooks, session service |
| `@workspace/ui` | shadcn/ui design system components |
| `@workspace/shared` | DTOs, types, constants, permissions, country config |
| `@workspace/database` | Drizzle ORM schema + Neon Postgres client |
| `@workspace/eslint-config` | Shared ESLint presets |
| `@workspace/typescript-config` | Shared TypeScript presets |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm 10+
- Python 3.12+ (for `bridge`)
- Neon Postgres account
- (Optional) Cloudflare R2 bucket
- (Optional) Upstash Redis account
- (Optional) Resend or SMTP credentials

### Install

```bash
pnpm install
```

### Environment setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/cms/.env.example apps/cms/.env
cp apps/console/.env.example apps/console/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
cp apps/bridge/.env.example apps/bridge/.env
```

### Database

```bash
pnpm db:generate    # Generate migrations (requires approval)
pnpm db:migrate     # Apply migrations
pnpm db:check       # Verify schema consistency
pnpm db:seed        # (optional) Seed demo data
```

> **WARNING:** `pnpm db:push` is for local prototyping only. Never use on shared branches.

### Development

```bash
pnpm dev            # Run all apps via Turbo
# or individually:
cd apps/api && pnpm dev
cd apps/cms && pnpm dev
cd apps/console && pnpm dev
cd apps/web && pnpm dev
cd apps/bridge && uv run python main.py
```

### Lint & Typecheck

```bash
pnpm lint
pnpm typecheck
pnpm format
```

---

## Architecture Highlights

- **Multi-tenancy** — Every gym is an `Organization`. All queries filter by `organizationId`.
- **Two-tier roles** — `GLOBAL_ROLES` (platform admin) + `ORG_ROLES` (tenant-scoped).
- **RBAC matrix** — Defined in `packages/shared/src/permissions/matrix.ts`. Server-side enforcement via `authorize()`.
- **Route handler wrappers** — `withAuth(module, action)` in `apps/api/lib/route-handler.ts`.
- **Caching** — Upstash Redis with graceful degradation. Key patterns in `AGENTS.md`.
- **Atomic Invoicing** — Subscriptions + Payments created in a single unit.
- **Cumulative Expiration** — Renewing extends from `periodEnd`, not today.
- **Multi-currency** — Base currency (USD) + local currencies via real-time exchange rates.
- **CMS** — Dynamic pages/blocks authored in CMS, rendered in `web` via `/api/public/pages/[slug]`.
- **Bridge** — Local Flet app polls `/api/access-control/sync-tasks` for biometric device enrollment.

---

## Documentation

- `AGENTS.md` — Agent guide, dev commands, full RBAC, architecture rules
- `docs/PENDING.md` — Roadmap & pending tasks
- `docs/TIMEZONE_MANAGEMENT.md` — Timezone handling
- `spec/` — CI/CD process specifications