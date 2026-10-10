> **Alcance:** feature-flags de los planes SaaS, free floor y cuotas de AI (`ai_chat`).
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Features & Free Tier (SaaS Plan Feature-Flags)

Platform SaaS plans are described with **features (feature-flags)** instead of loose booleans. Single source of truth in code: `packages/shared/src/features/catalog.ts` (re-exported by `@workspace/shared`).

### Catalog (`FEATURE_CATALOG`, version `FEATURE_CATALOG_VERSION`)

| Feature          | kind    | Limits               | Notes                                  |
| ---------------- | ------- | -------------------- | -------------------------------------- |
| `panel`          | boolean | —                    | `alwaysOn` (cannot be disabled)        |
| `cms`            | boolean | —                    | Content/pages                          |
| `blog`           | boolean | —                    | Blog                                   |
| `members_portal` | boolean | `member_seats`       | Member Portal (seats)                  |
| `ai_chat`        | boolean | `ai_credits_monthly` | AI Chat (credits/month; 0 = unlimited) |

Extension rules: every new feature is born `defaultEnabled: false` (additive); `normalizeFeatures` ignores unknown IDs and sanitizes types (numeric limits, 0 = unlimited); `resolveFeatures(null)` → catalog defaults.

### Free Tier (free floor)

- **Explicit, NOT a plan**: configured in `platform_setting` with 2 keys — `feature_flags_free_tier` (JSON of `PlanFeaturesV2`) and `feature_flags_free_tier_enabled` (`"true"`/`"false"`, activation flag) — edited from console → Settings → **Free Plan** (`apps/console/app/(protected)/settings/free-tier/`). There is no `is_free`; plans with `price = 0` are normal trials. The resolver ignores the setting if `feature_flags_free_tier_enabled !== 'true'`.
- **Code defaults** (`FREE_TIER_FEATURES`): `panel` + `members_portal` (10 seats) + `ai_chat` (500 credits/month). Overridable from console.
- **Resolution rule** (`features.service.ts → getOrgFeatures`):
  - Sub `ACTIVE`/`TRIAL` → plan features (with `planId`/`planName`).
  - Sub `PAST_DUE`/`READ_ONLY`/`SUSPENDED`/`CANCELLED` **or no sub** + free tier **enabled** (`enabled === 'true'`) → free floor (`isFreeTier: true`).
  - No free tier enabled → legacy behavior (`past_due`/`read_only` banner, `suspended`/`cancelled` blocking).

### Enforcement (downgrade = hide)

- **Middleware** `requireFeature(featureId)` in `apps/api-worker/src/lib/route-handler.ts` → 403 `{ code: 'FEATURE_NOT_AVAILABLE' }` if the feature is not enabled. Applied after `requireOrgPermission`.
- **Gated routes**: `/api/cms/*` → `cms`; `/api/ai/chat` → `ai_chat` (plus monthly credit quota, see below).
- **Portal seats** (`members_portal.member_seats`): `GET /api/organizations/seats` → `{ used, limit, pending }` (used = active gym_members with `userId`; pending = Better Auth `pending` invitations). Guard in `members.route.ts` (POST `/api/members` with `sendInvite` and role `member`, and in `link-user`) → 403 `FEATURE_LIMIT_REACHED` if `limit > 0` and `used + pending >= limit`. `limit 0` = unlimited.
- **Frontend**: `OrgFeaturesProvider` + `filterNavItemsByFeatures` hide sidebar items; guards in `/dashboard/content` and `/dashboard/chat`; `ai-quota-banner` and `portal-seats-banner`.

### AI Credits (`ai_chat`)

- **Unit**: 1 credit = 1K tokens (x1.0, see `shared/ai.ts` `AI_CREDIT_CONSTANTS`). Default provider in `platform_setting` `ai_provider_default` (`openrouter` | `workers-ai`, default `openrouter`, automatic fallback to the other). Docs: `vaults/ai/CHAT_PRICING.md`, `vaults/ai/CHAT_INFRASTRUCTURE.md`.
- **Limits**: `ai_chat.limits.ai_credits_monthly` per plan (configurable in admins, not hardcoded) + free tier `FREE_TIER_FEATURES` (500/month). Catalog in `shared/features/catalog.ts`.
- **Balance limits**: `AI_CHAT_LIMITS` in `shared/ai.ts` (`maxUserMessageChars: 500`, `maxHistoryMessageChars: 2_000`, `maxInputChars: 8_000`, `maxOutputTokens: 800` normal / `maxToolOutputTokens: 2_048` for tool, `maxHistoryMessages: 10`). Zod and `ai.service` clamp `max_tokens`. The system prompt is composed server-side — the client never sends role `system`.
- **Source of truth**: `ai_usage` table — row per `(organization_id, period_type='monthly', periodStart)` with `credits`, atomic upsert. `periodStart` = subscription cycle if ACTIVE/TRIAL, otherwise calendar day 1 (lazy reset, no cron). Index `idx_ai_usage_org_period`.
- **Accounting**: `consumeAiCredits(estimated)` (pre-flight) + `settleAiCredits(actual)` post-stream via `ctx.waitUntil` (DB is source of truth). Compat `consumeAiMessage` (3 credits) for tests. `cache.increment` exists but is unused.
- **RAG (Knowledge Base)**: automatic retrieval pre-generation in `/api/ai/chat`. Config in `RAG_CONFIG` (`shared/ai.ts`: topK 4, minSimilarity 0.35, chunkSizeChars 800, overlap 100, maxContextChars 2_000). Embeddings ALWAYS Workers AI `@cf/baai/bge-m3` (1024 dims, multilingual) via `aiService.embed()` — independent of the chat provider. System prompt = `PANEL_SYSTEM_PROMPT` (`shared/prompts.ts`) + `[Contexto]` block; RAG failure never breaks chat. KB admin: Console → Settings → Knowledge Base (`/api/platform/knowledge`, tables `ai_knowledge_document`/`ai_knowledge_chunk`, pgvector HNSW; `organization_id NULL` = platform, set = org doc with isolation in SQL). Phase 2: panel org-KB + function calling (live data).
- `GET /api/ai/usage` → `{ monthly: { used, limit }, remaining, disabled, periodStart }`. `POST /api/ai/chat` estimates credits (+ chars of the composed prompt + `RAG_CONFIG.maxContextChars` cap), validates balance, does openrouter→glm fallback and settles `creditsFromUsage(usage)`; headers `X-Ai-Credits-Used/Limit/Remaining`; if exhausted → 429 `{ code: 'AI_QUOTA_EXCEEDED', limits }`. `limit 0` = unlimited.

### Feature snapshot in payments

Every platform payment (`platform_subscription_payment`) stores `features_snapshot` (JSON of `PlanFeaturesV2`) when creating a subscription, renewing, changing plan and recording payment — to compare "features at payment time" vs "plan today" (`summarizeFeatures` in console). Cache invalidation: `org:${orgId}:features` on subscription, plan and platform settings writes.

### Endpoints

| Endpoint                          | Auth                  | Use                                                       |
| --------------------------------- | --------------------- | --------------------------------------------------------- |
| `GET /api/platform/features`      | `requirePlatformAuth` | Catalog (console)                                         |
| `/api/platform/knowledge`         | `requirePlatformAuth` | AI Knowledge Base CRUD (platform docs, bge-m3 embeddings) |
| `GET /api/organizations/features` | `requireAuth`         | Resolved features + `isFreeTier` + status (panel gate)    |
| `GET /api/organizations/seats`    | `requireAuth`         | Portal seats                                              |
| `GET /api/ai/usage`               | `requireAuth`         | AI quotas                                                 |
