# Backlog — IA / Chat

> Packs de créditos, RAG fase 2 y limpieza de compatibilidad.
> Volver al [[backlog/README|índice del backlog]]. Fuentes vigentes: [[CHAT_PRICING]] y [[CHAT_INFRASTRUCTURE]].

> Estado real: migrado a **créditos** (`1 crédito = 1K tokens ×1.0`, `ai_credits_monthly`, `ai_usage.credits`). Lo de abajo es lo que **falta**.

## 1. Packs de créditos (Stripe)

- [ ] **Comprar créditos extra sin cambiar de plan.**
  - Constantes `CREDIT_PACKS` en `packages/shared/src/ai.ts` (1.000 cr/$1.20, 3.000 cr/$3.00, 7.000 cr/$6.50) — hoy solo documentadas, sin código.
  - Tabla `ai_credit_pack_purchase` (org, créditos comprados/restantes, Stripe `payment_intent`, FIFO). Consumo **plan → packs** (el ledger `ai_usage` sigue por ciclo; los packs son tabla aparte).
  - Endpoints `POST /api/ai/packs/purchase` + webhook Stripe + UI en `panel` (billing) y `console` (gestor de packs).
  - Headers/balance deben sumar `remaining = plan_remaining + packs_remaining`.
  - **Disparador**: cuando se quiera monetizar créditos fuera del plan.

## 2. RAG fase 2 (datos vivos + org-KB en panel)

- [x] **RAG Fase 1 (Base de Conocimiento)** — implementado:
  - Modelo `@cf/baai/bge-m3` 1024 dims (multilingüe) + **pgvector** HNSW, tablas `ai_knowledge_document`/`ai_knowledge_chunk` (`organization_id NULL` = plataforma).
  - Endpoints `/api/platform/knowledge` (console) + retrieval en `/api/ai/chat` (topK 4, minSimilarity 0.35, `PANEL_SYSTEM_PROMPT` + `[Contexto]`).
- [ ] **Function calling con datos reales** (`members`, `payments`, `classes` por `organizationId`) + KB por organización editable desde panel. Ver [[FUTURE_IDEAS]] § 5.

## 3. RAG avanzado (futuro)

- [ ] **Re-ranking, cache de retrieval, embeddings por idioma ES/PT.** Ver [[FUTURE_IDEAS]] § 5.

## 4. Compat / limpieza

> Retirados y verificados en [[FS-0003]]: helpers `consumeAiMessage` y alias `daily`/`weekly` de `GET /api/ai/usage` (ya no existen en endpoints; solo queda fallback en tests viejos). Abajo lo que falta.

- [ ] **Decidir cuándo retirar:**
  - Columna legacy `ai_usage.count` (mensajes) — mantener hasta confirmar que ningún dashboard la lee.
  - Cache `increment` de Redis (existe pero no se usa; la DB es fuente de verdad).
