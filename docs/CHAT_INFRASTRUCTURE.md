# Chat — Infraestructura y Router

> **Fuente vigente (21 ago 2026).** Complementa a [`CHAT_PRICING.md`](./CHAT_PRICING.md) (unidad/planes/packs). Define router, ledger y operación. Reemplaza a [`CHAT_IMPLEMENTATION.MD`](./CHAT_IMPLEMENTATION.MD) (⏸ DEPRECATED).

## Modelos y provider

- **Allowlist** en `shared/ai.ts` (`ALL_CHAT_MODEL_IDS`): `@cf/zai-org/glm-4.7-flash` (Workers AI) + cadena OpenRouter fija de 3 (`z-ai/glm-5.2:free`, `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3.5-lightning:free`). Single source para `api-worker` (validación/ruteo) y `panel` (selector vía RSC).
- **Provider por defecto** en `platform_setting` key `ai_provider_default` (`openrouter` | `workers-ai`, default `openrouter`) — Console → Settings → IA Provider. El otro es **fallback automático** (ver § Router). Helper `resolveAiProviders()` en `shared/ai.ts` (`AI_DEFAULT_PROVIDER`).
- **Workers AI**: **10K neurons/día gratis** (reset 00:00 UTC, **5.500 neurons/M in**, **36.400/M out** para GLM-4.7-flash). Excedente **$0.011/1K neurons**, requiere **Workers Paid $5/mes**. Coste en $: **$0.060/M in + $0.400/M out** (`CHAT_PRICING.md` § Coste real). `openrouter/free` es $0 al proveedor pero consume créditos igual.
- **OpenRouter free**: 50/día sin saldo, 1.000/día con $10 de crédito, 20 RPM — el circuit breaker evita cascada.

## Router con fallback automático

```
POST /api/ai/chat (SSE)
  ├─ lee ai_provider_default (cache platform:settings, 10 min)
  ├─ valida balance (estimated = ceil((chars/4 + maxTokens)/1000) → créditos, mínimo 1)
  ├─ 429 { code: 'AI_QUOTA_EXCEEDED' } si remaining < estimated
  ├─ intenta primary (ej. openrouter/free)
  │   └─ 429/5xx/timeout → cache openrouter:circuit=open 60s → fallback glm-4.7-flash
  └─ stream SSE (OpenAI SDK) + ctx.waitUntil(settle(usage real))
```

- El primer evento SSE `{"model": ...}` reporta el modelo que realmente respondió (relevante con `openrouter/free`).
- `X-Ai-Credits-Used` / `X-Ai-Credits-Limit` / `X-Ai-Credits-Remaining` se envían con la respuesta; `GET /api/ai/usage` expone `{ monthly: { used, limit }, remaining: number|null, disabled, periodStart }`.
- Gating: `requireFeature('ai_chat')` → 403 `FEATURE_NOT_AVAILABLE` si la org no tiene la feature; luego `consumeAiCredits` valida cuota.

## Ledger de créditos

- **Unidad:** `1 crédito = 1K tokens ×1.0` (`AI_CREDIT_CONSTANTS` en `shared/ai.ts`; helpers `creditsFromUsage` y `estimateCreditsFromMessages`).
- **Tabla** `ai_usage` (`organization_id`, `period_type='monthly'`, `period_start` date, `credits integer` + `count integer` legacy, `uniqueIndex idx_ai_usage_org_period`). Reset **perezoso** por ciclo (sin cron):
  - Con sub `ACTIVE`/`TRIAL`: `periodStart = startOfSubscriptionPeriod(currentPeriodEnd, duration)` (`features.repository.ts`)
  - Sin sub o sub no activa: `startOfMonthUtc(now)` (día 1 00:00 **UTC**, ver `docs/TIMEZONE_MANAGEMENT.md` — no usa timezone de la org)
- `features.service.getCreditPeriodStart(orgId)` computa el inicio; `getAiQuota(orgId)` lee `credits` vs `ai_credits_monthly` (`0 = ilimitado`).
- **Evaluación:** `consumeAiCredits(estimated)` (pre-flight, solo valida) + `settleAiCredits(periodStart, actualCredits)` post-stream vía `ctx.waitUntil` — upsert atómico `INSERT … ON CONFLICT (organization_id, period_type, period_start) DO UPDATE SET credits = credits + actual`. La DB es fuente de verdad; `cache.increment` existe pero no se usa.

## Topes y validación

- Zod usa `AI_CHAT_LIMITS` (no magic numbers): `maxUserMessageChars: 500`, `maxHistoryMessageChars: 2_000`, `maxInputChars: 8_000`, `maxOutputTokens: 800` normal / `maxToolOutputTokens: 2_048` tool, `maxMessages: 50` (límite duro) pero `ai.service` envía `slice(-10)`. El system prompt lo compone el servidor (`PANEL_SYSTEM_PROMPT` + RAG) — el cliente nunca envía role `system`.
- `ai.service` pide `stream_options: { include_usage: true }` y acumula `usage` (`prompt_tokens` + `completion_tokens`) de cada chunk/tool call; luego `creditsFromUsage(usage)` liquida.

## Cache

- `platform:settings` (**10 min**) — incluye `ai_provider_default`; invalidada en `POST /api/platform/settings`.
- `org:${orgId}:features` (**5 min**) — incluye `ai_chat.limits.ai_credits_monthly` y `isFreeTier`.
- No hay key separada `ai:provider:default`: se deriva de `platform:settings` (compat con docs previos).

## Coste y operación

- GLM **$0.060/M in + $0.400/M out** (ver `CHAT_PRICING.md` § Unidad). 100 orgs × 30 sesiones/día ≈ **$220/mes** (medio). MRR **$4.400** (40×$30 + 40×$45 + 20×$70).
- **Workers Paid $5/mes** cubre el base; el free de **10K neurons/día** es marginal a esta escala. Excedente $0.011/1K neurons.
- OpenRouter free: 50/día sin saldo, 1.000/día con $10, 20 RPM — el circuit breaker evita cascada.

## Futuro (packs, RAG) — pendientes

> Pack Stripe sigue **pendiente** (`PENDING.md` § 6). RAG Fase 1 ya implementado con `@cf/baai/bge-m3` + pgvector (ver `FUTURE_IDEAS.md` § 5).

- **RAG Fase 1 (implementado):** `@cf/baai/bge-m3` 1024 dims (multilingüe) + **pgvector** HNSW cosine, tablas `ai_knowledge_document`/`ai_knowledge_chunk`, retrieval automático en `/api/ai/chat` (topK 4, minSimilarity 0.35), system prompt `PANEL_SYSTEM_PROMPT` + `[Contexto]`.
- **Packs:** constantes `CREDIT_PACKS` (1K/$1.20, 3K/$3.00, 7K/$6.50) + tabla `ai_credit_pack_purchase` **FIFO** (consumo plan → packs), compra **Stripe** después.

## Referencias

- Pricing/límites: [`CHAT_PRICING.md`](./CHAT_PRICING.md)
- Código: `packages/shared/src/ai.ts`, `packages/shared/src/features/catalog.ts`, `apps/api-worker/src/routes/ai.route.ts`, `apps/api-worker/src/services/ai.service.ts`, `apps/api-worker/src/services/features.service.ts`.
