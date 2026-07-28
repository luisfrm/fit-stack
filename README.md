# Fit-Stack

Multi-tenant SaaS platform for the gym & fitness industry, primarily targeting the Latin American market. Solves multi-currency billing, member retention, and automated physical access control.

> **Status:** Active development.

---

## Overview

Fit-Stack is composed of **applications** + **shared packages** in a single pnpm/Turbo monorepo.

### Applications

| App | Stack | Port / Platform | Purpose |
|-----|-------|:----:|---------|
| `api-worker` | Hono + Cloudflare Workers | Edge API | Primary REST API (Better Auth + Drizzle ORM + Hono) |
| `jobs-worker` | Cloudflare Queues | Worker | Background jobs processor (Emails via Resend, PDFs, Notifications) |
| `panel` | Next.js 16 (App) | 3001 | Gym admin panel (Owner/Manager/Cashier) |
| `web` | Next.js 16 (App) | 3002 | Public marketing + CMS pages & Member portal |
| `console` | Next.js 16 (App) | 3003 | SaaS super-admin (organizations, plans, subscriptions) |
| `bridge` | Python/Flet | Desktop Kiosk | Desktop app for biometric & QR access control |
| `api` | Next.js 16 | 3000 | *(DEPRECATED)* Legacy Next.js API Routes |

### Packages

| Package | Purpose |
|---------|---------|
| `@workspace/auth` | Shared Better Auth client, hooks, session service |
| `@workspace/ui` | shadcn/ui design system components |
| `@workspace/shared` | DTOs, types, constants, permissions (`hasAccess`), country config |
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
cp apps/panel/.env.example apps/panel/.env
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
cd apps/api-worker && pnpm dev
cd apps/panel && pnpm dev
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
- **Cloudflare Workers API** — `apps/api-worker` (Hono + Neon HTTP driver) using `Route → Service → Repository → Database` layering.
- **Two-tier roles** — `GLOBAL_ROLES` (platform admin) + `ORG_ROLES` (tenant-scoped).
- **Unified RBAC** — Defined in `packages/shared/src/access-control.ts`. Includes `panel: ["access"]` and `hasAccess()` evaluation.
- **Drizzle Schema Rule** — No PostgreSQL `pgEnum` types. Uses `text().$type<...>()` to avoid breaking database migrations.
- **Caching** — Upstash Redis with graceful degradation.
- **Atomic Invoicing** — Subscriptions + Payments created in a single unit.
- **Cumulative Expiration** — Renewing extends from `periodEnd`, not today.
- **Multi-currency** — Base currency (USD) + local currencies via real-time exchange rates.
- **Bridge** — Local Flet app polls `/api/access-control/sync-tasks` for biometric device enrollment.

---

## Documentation

- [ARCHITECTURE.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/ARCHITECTURE.md) — Detailed architecture design & system decisions
- [AGENTS.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/AGENTS.md) — Agent guide, dev commands, full RBAC, architecture rules
- `docs/PENDING.md` — Roadmap & pending tasks
- `docs/TIMEZONE_MANAGEMENT.md` — Timezone handling