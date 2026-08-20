# Fit-Stack

Multi-tenant SaaS platform for the gym & fitness industry, primarily targeting the Latin American market. Solves multi-currency billing, member retention, and automated physical access control.

> **Status:** Active development.

---

## Overview

Fit-Stack is composed of **applications** + **shared packages** in a single pnpm/Turbo monorepo.

### Applications

| App | Stack | Port / Platform | Purpose |
|-----|-------|:----:|---------|
| `api-worker` | Hono + Cloudflare Workers | 8788 | Primary REST API (Better Auth + Drizzle ORM + Hono) |
| `jobs-worker` | Cloudflare Queues | 8787 | Background jobs processor (Emails via Resend, PDFs, Notifications) |
| `panel` | Next.js 16 (App) | 3001 | Gym admin panel (Owner/Manager/Cashier) |
| `web` | Next.js 16 (App) | 3002 | Public marketing + CMS pages & Member portal |
| `console` | Next.js 16 (App) | 3003 | SaaS super-admin (organizations, plans, subscriptions) |
| `bridge` | Python/Flet | Desktop Kiosk | Desktop app for biometric & QR access control — ⏸ **pausado** |
| `api` | Next.js 16 | 3000 | *(DEPRECATED)* Legacy Next.js API Routes — ⏸ **pausado, solo referencia** |

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
- **Two-tier roles** — Platform roles (`owner`/`admin`/`support`, SaaS console) + `ORG_ROLES` (tenant-scoped panel).
- **Unified RBAC** — Defined in `packages/shared/src/access-control.ts`. Includes `panel: ["access"]` and `hasAccess()` evaluation.
- **Drizzle Schema Rule** — No PostgreSQL `pgEnum` types and no `.$type<...>()` annotations. Uses plain `text()` columns; allowed values are validated by Zod (backend) and the frontend, never by the DB layer.
- **Caching** — Upstash Redis with graceful degradation (cache keys in AGENTS.md).
- **Active org profile** — Resolved by the `api-worker` custom session (`activeOrganization`) with a 5-min Redis cache (`org:{id}:profile`).
- **Atomic Invoicing** — Subscriptions + Payments created in a single unit.
- **Cumulative Expiration** — Renewing extends from `periodEnd`, not today.
- **Multi-currency** — Base currency (USD) + local currencies via real-time exchange rates.
- **Bridge (pausado)** — Local Flet app polls `/api/access-control/sync-tasks` for biometric device enrollment (endpoints aún no migrados al api-worker).

---

## Deploy

### Deployment Model

| Component | Hosting | Strategy |
|-----------|---------|----------|
| `api-worker`, `jobs-worker` | Cloudflare Workers | Automated via GitHub Actions (`deploy-api-worker.yml` / `deploy-jobs-worker.yml`) + Terraform provisioning |
| `panel`, `web`, `console` | Vercel | Manual (`vercel --prod` or Vercel Dashboard) |
| Database (Neon) | Neon Postgres | Migrations via `database-migrations.yml` (Drizzle) |
| Cloudflare infra (R2, Queues, Secrets) | Cloudflare | Terraform (`terraform.yml` — plan/apply per environment) |

### GitHub Actions Workflows (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Pull requests to `master`/`develop` | Lint + typecheck of affected apps (Turbo) |
| `deploy-api-worker.yml` | Push to `master`/`develop` or `workflow_dispatch` | Deploys the API worker (production / dev) |
| `deploy-jobs-worker.yml` | Push to `master`/`develop` or `workflow_dispatch` | Deploys the jobs worker |
| `database-migrations.yml` | Schema changes or `workflow_dispatch` | Applies Neon migrations (`pnpm db:migrate`) |
| `terraform.yml` | `workflow_dispatch` (`plan` / `apply`) | Provisions Cloudflare resources per environment |

### Local vs Production

- **Local development**: `pnpm dev` (see Quick Start above). Each app reads its `.env` (templates in `.env.example`); the `api-worker` reads `.dev.vars` via Wrangler.
- **Production**: workers and DB are deployed through the workflows above; the Next.js apps are deployed manually to Vercel with `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_R2_URL` configured per app. Secrets live in GitHub Environments (workers) and Vercel (frontend).

For the full deployment guide see [INFRASTRUCTURE.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/INFRASTRUCTURE.md) and [infrastructure/terraform/README.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/infrastructure/terraform/README.md).

---

## Documentation

- [ARCHITECTURE.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/ARCHITECTURE.md) — Detailed architecture design & system decisions
- [AGENTS.md](file:///c:/Users/LAPTOP/Documents/PROJECTS/fit-stack/AGENTS.md) — Agent guide, dev commands, full RBAC, architecture rules
- `docs/PENDING.md` — Roadmap & pending tasks
- `docs/TIMEZONE_MANAGEMENT.md` — Timezone handling