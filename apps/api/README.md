# Fit-Stack API

The central HTTP API for the Fit-Stack platform — **Next.js 16** (App Router + Route Handlers), **Better Auth** (session management), **Drizzle ORM** (PostgreSQL via Neon), **Upstash Redis** (caching), **Cloudflare R2** (file uploads), **Nodemailer/Resend** (emails).

Runs on **port 3000** by default.

---

## Quick Start

### Prerequisites

- Node.js >= 20, pnpm 10+
- A running Neon Postgres database
- (Optional) Upstash Redis instance
- (Optional) Cloudflare R2 credentials
- (Optional) SMTP or Resend credentials

### Install

```bash
pnpm install
```

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | Neon/Postgres connection string |
| `BETTER_AUTH_SECRET` | ✅ | Min 16 characters |
| `APP_ENV` | ✅ | `development`, `staging`, or `production` |
| `TRUSTED_ORIGINS` | | Comma-separated CORS origins (production only) |
| `COOKIE_DOMAIN` | | Cookie domain for cross-subdomain auth |
| `JWT_SECRET` | | For token operations |
| `R2_ACCOUNT_ID` | | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | | Cloudflare R2 secret |
| `R2_BUCKET_NAME` | | Cloudflare R2 bucket name |
| `R2_PUBLIC_URL` | | Cloudflare R2 public endpoint |
| `UPSTASH_REDIS_REST_URL` | | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | | Upstash Redis auth token |
| `EMAIL_PROVIDER` | | `smtp` or `resend` |
| `SMTP_USER` | | SMTP username (if EMAIL_PROVIDER=smtp) |
| `SMTP_PASS` | | SMTP password |
| `RESEND_API_KEY` | | Resend API key |
| `RESEND_FROM_EMAIL` | | Sender email address |
| `ACCESS_CONTROL_API_KEY` | | API key for Bridge app requests |

```bash
cp .env.example .env
# Fill in the required values
```

### Run

```bash
pnpm dev          # Dev server (Turbopack, port 3000)
pnpm build        # Production build
pnpm start        # Production server
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
```

---

## Project Structure

```
apps/api/
├── app/api/                    # Route Handlers (REST endpoints)
│   ├── auth/[...all]/          # Better Auth handler
│   ├── access-control/         # Bridge integration (verify, sync-tasks, mark-synced)
│   ├── cms/                    # CMS pages & blocks
│   ├── classes/                # Gym classes CRUD
│   ├── dashboard/stats/        # Dashboard KPIs
│   ├── health/                 # Liveness check
│   ├── init/                   # System initialization (first SaaS admin)
│   ├── members/                # Gym members CRUD + link-user + me + validate-token
│   ├── organizations/          # Org subscription status
│   ├── payments/               # Payments CRUD + analytics + status + send-email
│   ├── plans/                  # Membership plans CRUD
│   ├── platform/               # SaaS admin (GLOBAL_ROLES.ADMIN only)
│   │   ├── organizations/      #   List, get, create, join, staff, subscriptions
│   │   ├── plans/              #   CRUD + summary + with-stats
│   │   ├── settings/           #   Global platform settings
│   │   └── subscriptions/      #   CRUD + stats
│   ├── public/pages/[slug]/    # Public CMS pages (no auth, x-organization-id header)
│   ├── reports/revenue/        # Monthly revenue report
│   ├── settings/               # Per-org settings (key-value)
│   ├── subscriptions/          # Member subscriptions CRUD
│   ├── trainers/               # Coaches CRUD
│   └── upload/                 # R2 presigned URLs + file listing
├── config/                     # Auth, envs, urls, route-handler wrappers
│   ├── auth.ts                 # Better Auth setup (Drizzle adapter, customSession, org plugin)
│   ├── auth-utils.ts           # authorize(), getOrgContext(), requireGlobalAdmin()
│   ├── envs.ts                 # Zod-validated env vars
│   ├── get-session.ts          # Session helper
│   ├── urls.ts                 # App URLs by environment
│   └── cms-block-config.ts     # CMS block Zod schemas
├── lib/
│   ├── cache.ts                # Centralized Upstash cache wrapper
│   ├── redis.ts                # Upstash Redis client
│   ├── route-handler.ts        # withAuth, withSession, withPlatformAuth wrappers
│   └── date-manager.ts         # Timezone-aware date utils
├── repositories/               # Drizzle queries (one per domain)
├── services/                   # Business logic
│   ├── pdf/                    # @react-pdf/renderer templates
│   └── ...service.ts           # One service per domain
└── proxy.ts                    # CORS + session validation (replaces middleware.ts)
```

---

## Architecture

### 3-Layer Separation

Every domain follows: **Route Handler → Service → Repository**.

1. **Repository** — Drizzle ORM queries, always filter by `organizationId`
2. **Service** — Business logic, validation, multi-step orchestration
3. **Route Handler** — HTTP concerns only, delegates to service

### Route Handler Wrappers

Use wrappers from `apps/api/lib/route-handler.ts` — never write auth boilerplate manually.

```ts
// Org-scoped with permission check
export const GET = withAuth(PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => { /* logic */ }
);

// Org-scoped, no permission check
export const POST = withSession()(
  async (req, { organizationId }) => { /* logic */ }
);

// SaaS admin (GLOBAL_ROLES.ADMIN only)
export const GET = withPlatformAuth()(async (req) => { /* logic */ });
```

`params` are auto-resolved from Promises — no manual `await params` needed.

### Authentication

- **Library**: [Better Auth](https://better-auth.com) v1.5.5
- **Adapter**: Drizzle (Postgres/Neon)
- **Custom session**: `customSession` plugin enriches session with `member.role` (cached in Redis for 60s)
- **Endpoints** (autogenerated by Better Auth): `POST /api/auth/sign-up`, `POST /api/auth/sign-in`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `POST /api/auth/organization/*`

### Authorization (RBAC)

```ts
import { authorize } from '@/config/auth-utils';
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared';

if (!await authorize(session, organizationId, PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

See `AGENTS.md` for the full permission matrix.

### Multi-Tenancy

Every org-scoped query MUST filter by `organizationId` (from session's `activeOrganizationId`).
The `proxy.ts` middleware validates session cookies on every `/api/*` request except public endpoints.

**Public endpoints** (no auth required):
- `/api/auth/*` (Better Auth)
- `/api/health`
- `/api/init`
- `/api/members/validate-token`
- `/api/public/pages/[slug]` (requires `x-organization-id` header)

### Caching

Upstash Redis with graceful degradation. Wrapper at `apps/api/lib/cache.ts`.

```ts
const data = await cache.get<T>(key);
await cache.set(key, data, ttlSeconds);
await cache.invalidate('org:org_123:*');
```

See `AGENTS.md` for the full key convention.

### Storage (Cloudflare R2)

S3-compatible via `@aws-sdk/client-s3`.

- `POST /api/upload/presigned` — get presigned upload URL
- `GET /api/upload?folder=` — list files in folder

### Email

Dual-provider (Nodemailer or Resend). Used for org invitations and payment receipts.

### PDF Receipts

Generated with `@react-pdf/renderer` in `apps/api/services/pdf/`.

---

## API Endpoints

### Auth `GET|POST /api/auth/[...all]`
Better Auth native handler. Routes: sign-up, sign-in, sign-out, get-session, organization.

### Health `GET /api/health`
Returns `{ status: "ok", timestamp }`.

### Init `GET|POST /api/init`
System bootstrap. `GET` checks if first admin exists. `POST` creates first global admin.

### Access Control (Bridge) `POST /api/access-control/verify`
- Auth: `x-api-key` header
- Body: `{ organizationId, documentId }`
- Returns: `{ allowed, message, memberName, memberId }`

### Access Control (Bridge) `GET /api/access-control/sync-tasks`
Returns pending biometric sync tasks for an organization.

### Access Control (Bridge) `POST /api/access-control/mark-synced`
Confirms a sync task as completed.

### Dashboard `GET /api/dashboard/stats?today=YYYY-MM-DD`
Dashboard KPIs (members, revenue, subscriptions).

### CMS Pages `GET|POST /api/cms/pages`
List or create CMS pages (org-scoped).

### CMS Pages `GET|PATCH|DELETE /api/cms/pages/[id]`
Get, update, or delete a CMS page.

### CMS Page Blocks `GET|POST /api/cms/pages/[id]/blocks`
List or create blocks for a page.

### CMS Blocks `GET|PATCH|DELETE /api/cms/blocks/[id]`
Get, update, or delete a block.

### Classes `GET|POST /api/classes`
List or create classes.

### Classes `GET|PATCH|DELETE /api/classes/[id]`
Get, update, or delete a class.

### Members `GET|POST /api/members`
List (paginated) or create gym members.

### Members `GET|PATCH|DELETE /api/members/[id]`
Get, update, or delete a member.

### Members `GET /api/members/me`
Current user's gym member profile.

### Members `POST /api/members/link-user`
Link a gym_member to a user account.

### Members `GET /api/members/validate-token`
Validate an invitation token.

### Members `POST /api/members/[id]/resend-invite`
Resend organization invitation email.

### Organization `GET /api/organizations/subscription-status`
Returns the org's platform subscription status.

### Payments `GET /api/payments/analytics`
Payment analytics (revenue by currency, period totals).

### Payments `POST /api/payments/[id]/status`
Change payment status (validate/invalidate/void).

### Payments `POST /api/payments/[id]/send-email`
Send payment receipt via email.

### Plans `GET|POST /api/plans`
List or create membership plans.

### Plans `GET|PATCH|DELETE /api/plans/[id]`
Get, update, or delete a plan.

### Plans `GET /api/plans/summary`
Plan summary (count, active, popular).

### Public `GET /api/public/pages/[slug]`
Public CMS page content (no auth, requires `x-organization-id` header).

### Reports `GET /api/reports/revenue?months=12`
Monthly revenue data.

### Settings `GET|PATCH /api/settings`
Get or update per-org settings.

### Settings `GET|PATCH|DELETE /api/settings/[key]`
Get, update, or delete a single setting.

### Subscriptions `GET|POST /api/subscriptions`
List or create member subscriptions.

### Subscriptions `GET|PATCH|DELETE /api/subscriptions/[id]`
Get, update, or cancel a subscription.

### Subscriptions `GET /api/subscriptions/recent`
Recent subscriptions (for dashboard).

### Trainers `GET|POST /api/trainers`
List or create trainers (coaches).

### Trainers `GET|PATCH|DELETE /api/trainers/[id]`
Get, update, or delete a trainer.

### Upload `GET /api/upload?folder=`
List files in a specific upload folder.

### Upload `POST /api/upload/presigned`
Get a presigned upload URL for Cloudflare R2.

### Platform (SaaS Admin) `GET|POST /api/platform/organizations`
### Platform `GET|PATCH|DELETE /api/platform/organizations/[id]`
### Platform `POST /api/platform/organizations/[id]/join`
### Platform `POST /api/platform/organizations/[id]/staff`
### Platform `GET|POST /api/platform/organizations/[id]/subscriptions`
### Platform `GET|POST /api/platform/plans`
### Platform `GET|PATCH|DELETE /api/platform/plans/[id]`
### Platform `GET /api/platform/plans/summary`
### Platform `GET /api/platform/plans/with-stats`
### Platform `GET|PATCH /api/platform/settings`
### Platform `GET|POST /api/platform/subscriptions`
### Platform `GET|PATCH|DELETE /api/platform/subscriptions/[id]`
### Platform `GET /api/platform/subscriptions/stats`

**Auth**: All platform endpoints require `GLOBAL_ROLES.ADMIN`.

---

## Key Files

- `config/auth.ts` — Better Auth configuration
- `config/auth-utils.ts` — Authorization helpers
- `lib/route-handler.ts` — Route handler wrappers
- `lib/cache.ts` — Cache abstraction
- `proxy.ts` — Middleware (CORS, session)
- `AGENTS.md` (root) — Full architecture & rules