> **Alcance:** caché con Upstash Redis: setup, métodos, claves/TTLs y estrategia de invalidación.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Redis Caching (Upstash)

The API uses **Upstash Redis** (`@upstash/redis` v1.37.0) for serverless-compatible caching.

### Setup

- **Wrapper**: `apps/api-worker/src/lib/cache.ts` — `createCache(env)` with error handling; Redis being down never blocks requests (graceful degradation).
- **Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both optional)

### Cache Methods

| Method            | Signature                      | Description                                         |
| ----------------- | ------------------------------ | --------------------------------------------------- |
| `get`             | `get<T>(key: string)`          | Fetch cached value by key                           |
| `set`             | `set(key, data, ttlSeconds?)`  | Store value with optional TTL (default 5 min)       |
| `invalidate`      | `invalidate(pattern: string)`  | Delete all keys matching a glob pattern (uses SCAN) |
| `invalidateExact` | `invalidateExact(key: string)` | Delete a single key                                 |

### Cache Key Conventions

| Pattern                                    | TTL    | Used For                                                                                          |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `org:${orgId}:settings`                    | 1 h    | Organization settings (invalidated on-write in POST /api/settings)                                |
| `org:${orgId}:profile`                     | 5 min  | Active org profile in custom session (branding/theme/timezone)                                    |
| `org:${orgId}:plans:*`                     | 1 h    | Membership plans (invalidated on-write in POST/PUT/DELETE /api/plans)                             |
| `org:${orgId}:classes:*`                   | 5 min  | Classes                                                                                           |
| `org:${orgId}:members:*`                   | 5 min  | Gym members                                                                                       |
| `org:${orgId}:members:stats`                | 5 min  | Member KPIs (`GET /api/members/stats`; cross-invalidated on subscription/payment writes because `withoutActiveSubscription` depends on subs/payments) |
| `org:${orgId}:subscriptions`               | 5 min  | Member subscriptions                                                                              |
| `org:${orgId}:dashboard:stats:*`           | 5 min  | Dashboard KPIs                                                                                    |
| `org:${orgId}:dashboard:action-items`      | 5 min  | Dashboard actionable lists (expiring soon / recently expired)                                     |
| `org:${orgId}:coaches:*`                   | 5 min  | Coaches/trainers                                                                                  |
| `org:${orgId}:cms:*`                       | 5 min  | CMS invalidation (reads are not cached)                                                           |
| `org:${orgId}:public:page:*`               | 15 min | Public page slugs (web)                                                                           |
| `org:${orgId}:subscription-status`         | 1 min  | Org billing status                                                                                |
| `org:${orgId}:subscription`                | 1 min  | Org SaaS sub with plan details (self-service renewal)                                             |
| `org:${orgId}:payment-methods`             | 1 h    | Platform payment methods exposed to the org (invalidated on-write in POST /api/platform/settings) |
| `rates:${base}`                            | 1 hr   | Server-side exchange rates (open.er-api.com, provider in `api-worker/src/lib/exchange-rates.ts`)  |
| `org:${orgId}:features`                    | 5 min  | Resolved features + isFreeTier of the org                                                         |
| `org:${orgId}:reports:revenue:12m`         | 1 hr   | Monthly revenue reports                                                                           |
| `org:${orgId}:reports:receipts:*`          | 5 min  | Receipts audit report (invalidated on-write in issue/status/subscription writes)                  |
| `member:role:${userId}:${orgId}`           | 1 min  | Cached Better Auth member role (custom session)                                                   |
| `platform:settings`                        | 1 h    | SaaS-level global settings (invalidated on-write in POST /api/platform/settings)                  |
| `platform:features`                        | 10 min | Feature catalog (console)                                                                         |
| `platform:organizations*`                  | 5 min  | Organization list (SaaS admin)                                                                    |
| `platform:plans*`                          | 1 h    | Platform plan catalog (invalidated on-write in /api/platform/plans)                               |
| `platform:subscriptions*`                  | 5 min  | SaaS subscriptions                                                                                |
| `platform:subscriptions:stats`             | 5 min  | Subscription KPI stats                                                                            |
| `platform:subscriptions:revenue:{months}m` | 1 h    | Monthly SaaS revenue series (invalidated on-write via `platform:subscriptions*`)                   |
| `platform:ai-usage:{orgId}`                | 5 min  | AI quota per org (invalidated in `POST /:id/ai-credits`)                                           |
| `platform:subscriptions:invoices:{orgId}`  | 5 min  | SaaS invoices per org (invalidated on-write via `platform:subscriptions*`)                         |
| `platform:gym-overview:{orgId}`            | 5 min  | Gym adoption + portal per org (no cross-invalidation from gym writes)                     |
| `platform:receipts:*`                      | 5 min  | Audit of the `FS-N` sequence (Console); key by filters, invalidated on-write on any subscription/payment write (issuance/voiding) |
| `platform:staff*`                          | 5 min  | Platform staff (SaaS admins: support/admin/owner)                                                 |

### Cache Invalidation Strategy

- **On writes (POST/PUT/DELETE)**: Invalidate related cache patterns immediately — e.g., creating a subscription invalidates `platform:subscriptions*`, `platform:subscriptions:stats`, and `org:${orgId}:subscription-status`. Low-frequency data (plans, settings, payment-methods) uses 1 h TTL as a safety net: real invalidation is always on-write.
- **Dashboard invalidations**: member/subscription/payment writes invalidate `org:{orgId}:dashboard:stats:*` and `org:{orgId}:dashboard:action-items` (KPIs and actionable lists).
- **Role invalidation**: `afterUpdateMemberRole` hook in Better Auth invalidates `member:role:${userId}:${orgId}` so role changes take effect instantly
- **Graceful degradation**: All cache methods wrap errors with `console.error` and return `null`/void — Redis being down never blocks requests
