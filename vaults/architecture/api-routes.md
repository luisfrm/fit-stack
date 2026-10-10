> **Alcance:** mapa de rutas montadas en `apps/api-worker` + allowlist de CORS.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## API Route Map (api-worker)

Routes mounted in `apps/api-worker/src/index.ts` (all under `/api`, except `/healthz` and `/favicon.ico`):

| Router               | Notable endpoints                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*`        | Better Auth engine (sessions, orgs, invitations)                                                                                                                                                                                                                                                                                                                                     |
| `/api/members`       | CRUD gym members + invites (`members.service` enqueues `email.registration_invite`) · `GET /stats` (client KPIs: total/active/inactive/newThisMonth/withoutActiveSubscription/withPortal + growth 6M + upcomingBirthdays, cache `org:*:members:stats`) · `GET /` accepts `?hasActiveSubscription=` (JOIN with gym-active semantics, `processing` counts as active) |
| `/api/plans`         | Membership plans (gym catalog)                                                                                                                                                                                                                                                                                                                                                       |
| `/api/subscriptions` | Subscriptions (create/list/update-status; payment registration enqueues `email.payment_receipt`) — **no DELETE** (immutable financial record) · `POST /` with the server-computed period (`startDate?`/`endDate?`/`endDateOverrideReason?`, 422 by code — contract in `apps/api-worker/README.md`) |
| `/api/payments`       | `PATCH /:id/status` accepts `processing \| validated \| voided` + optional `voidReason` (retired `pending`/`invalid` → **400**); returns the explicit void outcome (`receiptVoided` + `receiptVoidReason`). `→ validated` only from `processing` → **409 `{ code: 'PAYMENT_NOT_REVALIDATABLE' }`**, and never over a cancelled subscription → **409 `{ code: 'SUBSCRIPTION_CANCELLED' }`** (mirror of the console guard — invariant *validado ⇔ numerado*). `POST /:id/send-email` (receipt resend) |
| `/api/classes`       | Class schedule CRUD                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/trainers`      | Trainers (gym_member + coach_profile)                                                                                                                                                                                                                                                                                                                                                |
| `/api/cms`           | Content pages/blocks                                                                                                                                                                                                                                                                                                                                                                 |
| `/api/dashboard`     | KPI stats (`GET /stats`, cache `org:*:dashboard:stats:*`) + actionable lists (`GET /action-items`, cache `org:*:dashboard:action-items`)                                                                                                                                                                                                                                             |
| `/api/settings`      | Gym settings (currencies, payment methods, theme)                                                                                                                                                                                                                                                                                                                                    |
| `/api/reports`       | `GET /revenue` (multi-currency, cache 1h) · `GET /receipts` (receipt sequence audit: rows + summary + totals per currency + `gaps[]`, filters `from/to/status/method/year/page/limit`, cache 5 min) |
| `/api/organizations` | `GET /subscription-status` (org billing status) · `GET /subscription` (org SaaS sub with plan details, cache 1 min) · `GET /payment-methods` (platform payment methods exposed to the org, cache 10 min) · `POST /subscription/renew` (self-service renewal — see [`../business/platform-billing.md`](../business/platform-billing.md)) · `PATCH /profile` (location identity —name/slug/logo/slogan/timezone/currencyFormat— + emitter identity + `fiscalConfig` merge, `countryCode`/`primaryCurrency` immutable, invalidates `org:{id}:profile`) |
| `/api/upload`        | Uploads from the **panel** (SESSION org): `GET /` (list), `DELETE /`, `PUT /direct`, `POST /presigned` with `requireOrgPermission(MEMBERS, CREATE)` + `GET /file?key=` (authenticated delivery of private assets, `MEMBERS.READ`). Keys `<orgId>/<folder>/…`; `organizationId` **does not exist** in the contract |
| `/api/ai`            | `POST /chat` (SSE chat streaming: OpenAI SDK → fixed OpenRouter chain or Workers AI GLM, pre-generation RAG + `PANEL_SYSTEM_PROMPT`, `ai_chat` quota with RAG cap in pre-flight + `X-Ai-Credits-*` headers), `GET /models` (allowlist), `GET /usage` (AI quotas), `GET /conversations` + `PUT /conversations/:id` (upsert 1 conv, cap 10 msgs) + `DELETE /conversations/:id` (Redis) |

> **AI Chat**: the provider is inferred from the model id (`getAiProvider` in `@workspace/shared`). Fixed OpenRouter model chain (`OPENROUTER_TEXT_MODEL_CHAIN`) with fallback to GLM in Workers AI. The first SSE event is `{"model": ...}` with the concrete model that responded. `OPENROUTER_API_KEY` optional; if missing and an OpenRouter model is requested → 503. 1 credit = 1K tokens ×1.0 (`AI_CREDIT_CONSTANTS`), limits `AI_CHAT_LIMITS`, monthly cycle per subscription, RAG with embeddings `@cf/baai/bge-m3` (see `vaults/ai/CHAT_PRICING.md` / `vaults/ai/CHAT_INFRASTRUCTURE.md`). |
> | `/api/init` | Org bootstrap (no auth) |
> | `/api/public` | `GET /pages/:slug` (public CMS, cache 15 min) · `GET /files/*` (R2) — no auth, **allowlist**: only `<orgId>/cms/…` and `platform/branding/…`; the rest 404 |
> | `/api/platform/plans` | SaaS plan catalog (console) |
> | `/api/platform/subscriptions` | SaaS subscriptions + invoices + `GET /stats` + `GET /revenue?months=12` (monthly UTC buckets, validated only, cache 1h) + `GET /receipts` (audit of the `FS-N` sequence: rows + summary + totals per currency + `gaps[]`, filters `from/to/status/method/year/page/limit` in UTC, cache 5 min, `subscription:list` — support reads) + `GET /by-organization/:orgId/invoices` (SaaS invoice history per org, cache 5 min) + `GET /payments/:id/receipt` (3-state contract, `subscription:list` — support reads) + `GET /payments/:id/receipt/pdf` (binary, `subscription:list`) + `POST /payments/:id/resend` (4 branches, `requirePlatformAuth` — support 403) |
> | `/api/platform/organizations` | Platform org CRUD (console) + `GET /check-slug` (live availability, 409 `{ code: 'SLUG_TAKEN' }` if in use) + `GET /by-slug/:slug` (detail by slug, `?includeMemberCount=`) + `GET /:id/ai-usage` (cycle AI quota, cache 5 min, invalidated on grant) + `GET /:id/gym-overview` (gym adoption + portal seats, cache 5 min, staleness accepted: gym writes do not invalidate platform keys) |
> | `/api/platform/settings` | Platform global settings |
> | `/api/platform/staff` | Platform staff (console invites → enqueues `email.registration_invite`) |
> | `/api/platform/upload` | Platform assets WITHOUT organization — `POST /presigned`, `PUT /direct`, `GET /` (list), `GET /file`, `DELETE /` — auth `requirePlatformAuth`, **fixed scope `platform/branding/`** (only public platform prefix) |
> | `/api/platform/organizations/:id/upload` | Assets of ONE organization from the console: the org goes by **path** (never body/query) + `assertOrganizationExists` — `POST /presigned`, `PUT /direct`, `GET /` (list), `GET /file`, `DELETE /`; keys `<orgId>/…`, `requirePlatformAuth` |
> | `/api/platform/features` | Feature catalog (`GET /`, cache `platform:features`) |
> | `/api/platform/knowledge` | AI Knowledge Base CRUD (platform docs, bge-m3 embeddings, no Redis cache) — `GET /:id/content` (content only, no chunks, for editing without transferring embeddings) |
> | `/api/organizations/features` | Resolved features of the active org + `isFreeTier` (panel gate, cache `org:*:features`) |
> | `/api/organizations/seats` | Portal seats of the active org (`{ used, limit, pending }`) |

> `/api/access-control/*` is **NOT mounted** in api-worker (Bridge paused — see [`bridge.md`](./bridge.md)).

---

## CORS & Allowed Origins

The CORS allowlist is defined **in code only** — no env vars. Single source of truth in `apps/api-worker/src/lib/cors.ts`, consumed by:

- `apps/api-worker/src/lib/auth.ts` → `trustedOrigins` of Better Auth
- `apps/api-worker/src/index.ts` → `corsMiddleware` (Hono CORS)

| Environment   | Allowed origins                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `development` | Any `http://localhost:*` (3001 panel, 3002 web, 3003 console, 8787 jobs, 8788 api)                                                                                 |
| `production`  | Exact: `fitstack-panel.luisrivas.site`, `fitstack-console.luisrivas.site`, `fitstack-api.luisrivas.site`, `luisrivas.site` · Wildcards: `https://*.luisrivas.site` |

**Public routes skip auth**: `/healthz`, `/favicon.ico`, `/api/auth/*`, `/api/init`, `/api/public/*`. The global middleware tries to resolve a session but never blocks unauthenticated requests — machine-to-machine routes (e.g. access-control with `x-api-key`) work without a session.
