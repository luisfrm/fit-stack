# Chat — Pricing por Créditos (Fit-Stack)

> **Fuente vigente (21 ago 2026).** 1 crédito = 1K tokens ×1.0 para `@cf/zai-org/glm-4.7-flash` y `openrouter/free`. Reseteo mensual **por ciclo de suscripción** si `ACTIVE`/`TRIAL`, si no día 1 UTC. Ver también [`CHAT_INFRASTRUCTURE.md`](./CHAT_INFRASTRUCTURE.md) (router/ledger) y `AGENTS.md` § Features & Free Tier. Reemplaza a [`CHAT_IMPLEMENTATION.MD`](./CHAT_IMPLEMENTATION.MD) (⏸ DEPRECATED).

## Unidad y fórmula

- `1 crédito = ceil(tokens / 1000)` con `creditsFromUsage({ prompt_tokens, completion_tokens })` y `estimateCreditsFromMessages(messages, maxTokens)` — ambos en `packages/shared/src/ai.ts` (`AI_CREDIT_CONSTANTS.tokensPerCredit = 1_000`, `creditMultiplier = 1.0`).
- Estimado pre-flight: `ceil((chars/4 + maxTokens)/1000)` (mínimo 1). `chars/4` ≈ tokens de entrada; `maxTokens` es el `max_output_tokens` solicitado (clamp ver § Límites).
- Multiplicador por modelo = 1.0 para los dos modelos iniciales. Si se habilita otro modelo, se añade entrada `pricing` en `shared/ai.ts` sin tocar el ledger (`ai_usage`).
- Ciclo: `features.service.getCreditPeriodStart(orgId)` → si hay sub `ACTIVE`/`TRIAL` usa `startOfSubscriptionPeriod(currentPeriodEnd, duration)`; si no, `startOfMonthUtc(now)` (día 1 00:00 UTC, reset perezoso sin cron). La DB es la fuente de verdad, no Redis.

## Coste real (Workers AI, GLM-4.7-Flash)

- Input **$0.060/M** + Output **$0.400/M**. 1 req medio (2K in + 500 out = 2.5cr) = **$0.00032 → $0.000128/crédito**. Ver `CHAT_INFRASTRUCTURE.md` § Coste y operación para neurons (5.500/M in, 36.400/M out, 10K neurons/día gratis).
- `openrouter/free` cuesta $0 al proveedor pero consume créditos igual (presupuesto del free tier con control de cuota).

## Planes (configurables desde gestores, no hardcode)

Los créditos no están hardcodeados: cada plan define `ai_chat.limits.ai_credits_monthly` en `FEATURE_CATALOG` desde console → Planes. El free tier (`FREE_TIER_FEATURES`) es el default (500 créditos/mes) overrideable en console → Settings → Plan Gratuito (`feature_flags_free_tier` + flag `feature_flags_free_tier_enabled`).

Valores propuestos (ajustables desde UI):

| Plan | Precio | Créditos/mes | Mensajes (2.5cr) | Coste 100% uso | Margen IA imputado |
|---|---|---|---|---|---|
| Básico | $30 | 1.500 | 600 | $0.19 | 87% (sobre $1.50 imputados a IA) |
| Standard (+CMS) | $45 | 4.000 | 1.600 | $0.51 | 87% (sobre $4.00) |
| Premium (+Portal) | $70 | 8.000 | 3.200 | $1.02 | 87% (sobre $8.00) |
| Free tier | $0 | 500 | 200 | $0.06 | — |

Si el negocio es muy rentable, subir los créditos sin tocar precio es la palanca.

## Packs fijos (futuro — pendiente Stripe)

> **Pendiente:** constantes `CREDIT_PACKS` previstas en `shared/ai.ts` (no hardcode en rutas) + tabla `ai_credit_pack_purchase` FIFO. Ver `PENDING.md` § 6.

Propuestos (sin implementar compra): **1.000cr / $1.20**, **3.000cr / $3.00**, **7.000cr / $6.50**. Consumo **FIFO**: primero créditos del plan (`ai_credits_monthly`), luego packs. El ledger actual ya soporta `ai_usage.credits` por ciclo; los packs añadirán una tabla separada y endpoint de compra Stripe (no tocar `ai_usage` existente). Ver `FUTURE_IDEAS.md` para alternativas descartadas.

## Balance y headers

- Pre-flight: `getAiQuota(orgId)` → `{ monthly: { used, limit }, remaining, disabled, periodStart }`. `estimated = estimateCreditsFromMessages(messages, maxTokens)`. Si `remaining < estimated` → **429 `{ code: 'AI_QUOTA_EXCEEDED', limits }`**.
- Post-flight: `ctx.waitUntil(settleAiCredits(periodStart, actualCredits))` descuenta el uso **real** reportado por el provider vía `stream_options: { include_usage: true }` (`creditsFromUsage(usage)`). `consumeAiCredits` solo valida, `settleAiCredits` hace `INSERT … ON CONFLICT DO UPDATE credits += actual` atómico.
- Compat: `consumeAiMessage` (3cr) solo para tests; `cache.increment` existe pero no se usa — la DB es fuente de verdad.
- Headers: `X-Ai-Credits-Used` / `X-Ai-Credits-Limit` / `X-Ai-Credits-Remaining` (vacío si `limit 0`). `GET /api/ai/usage` retorna `{ monthly: { used, limit }, remaining: number|null, disabled, periodStart }` sin alias. `limit 0` = ilimitado.
- Gating: `requireFeature('ai_chat')` antes de `ai_chat` → 403 `FEATURE_NOT_AVAILABLE` si la feature está deshabilitada; luego valida cuota.

## Historial, límites de input/output

Constantes en `shared/ai.ts` (`AI_CHAT_LIMITS`):

| Constante | Valor | Uso |
|---|---|---|
| `maxUserMessageChars` | 500 | Mensaje del usuario (una pregunta/rutina) |
| `maxHistoryMessageChars` | 2.000 | Mensajes del historial (user/assistant) |
| `maxInputChars` | 8.000 | Total estimado por request (cap) |
| `maxOutputTokens` | 800 | Respuesta normal (`max_tokens` clamp) |
| `maxToolOutputTokens` | 2.048 | Caso tool / function calling |
| `maxHistoryMessages` | 10 | Mensajes enviados al modelo (slice) |
| `maxMessages` | 50 | Límite duro del schema Zod (valida, luego slice a 10) |

El route valida con Zod usando esas constantes y hace `messages.slice(-maxHistoryMessages)`. `ai.service` clampa `max_tokens` a 800 / 2.048 según `isTool`.

## Referencias

- Infra/router/ledger: [`CHAT_INFRASTRUCTURE.md`](./CHAT_INFRASTRUCTURE.md)
- Código: `packages/shared/src/ai.ts`, `packages/shared/src/features/catalog.ts`, `packages/database/src/schema.ts` (`ai_usage`), `apps/api-worker/src/services/features.service.ts` (`getAiQuota`, `consumeAiCredits`, `settleAiCredits`), `apps/api-worker/src/routes/ai.route.ts`.
