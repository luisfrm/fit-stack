---
id: FS-0003
aliases: ["FS-0003"]
title: "Backlog cumplido huerfano - storage R2 AI compat front-load"
status: done
priority: medium
created: 2026-09-20
depends_on: [FS-0001]
pr: null
---

# FS-0003 — Backlog cumplido huérfano (storage R2, AI compat, front-load)

> Task retroactiva de regularización: agrupa ítems del [[backlog/README|backlog]] que ya estaban implementados en código pero sin task asociada. No requirió PR nuevo; se verifica contra el código existente y se cierra como `done`. Lo pendiente de esos mismos archivos **sigue en el backlog** con su disparador.

## Problema

Tres cumplidos del backlog no tenían dueño en el sistema de tasks:

1. **Storage (R2)**: la taxonomía `<orgId>/<folder>/…` con corte limpio ya estaba implementada y testeada, pero el backlog la listaba como pendiente.
2. **AI compat**: `consumeAiMessage` y los alias `daily`/`weekly` de `GET /api/ai/usage` ya no existen en los endpoints (solo queda fallback en tests viejos), pero el backlog los listaba como "decidir cuándo retirar".
3. **Front-load SaaS (fix)**: el alta `processing` ya no front-loadea el periodo (`currentPeriodEnd = startDate` hasta validar), pero el backlog lo mezclaba con la auditoría histórica pendiente.

Sin esta task, esos cumplidos quedaban como deuda fantasma.

## Criterios de aceptación

- [x] Taxonomía `<orgId>/<folder>/…` verificada en stack activo + corte limpio sin compat.
- [x] `consumeAiMessage` y alias `daily`/`weekly` verificados como retirados de endpoints.
- [x] Fix front-load verificado en servicio SaaS + test de paridad.
- [x] Secciones cumplidas removidas del backlog; lo pendiente conserva su disparador.

## Alcance

| Capa                | Archivos / módulos |
| ------------------- | ------------------ |
| `packages/shared`   | `src/storage.ts` (`orgStoragePrefix`, `isPublicStorageKey`); `src/ai.ts` (sin `CREDIT_PACKS`, sin compat) |
| `packages/database` | `schema.ts` (`aiUsage.count` aún existe como legacy — fuera de esta task retirarla); `src/repositories/features.repository.ts` (lecturas legacy) |
| `apps/api-worker`   | `lib/storage-keys.ts`, `routes/public.route.ts`, `routes/upload.route.ts`, `routes/ai-usage.route.ts:28-34` (solo `monthly`), `services/platform-subscriptions.service.ts:176-186,515-538` (fix front-load) |
| Tests               | `packages/shared/tests/storage.test.ts:37-39`, `apps/api-worker/tests/integration/storage-isolation.test.ts:192-208`, `platform-subscription-status.test.ts:269-301` |

## Fuera de alcance

- Migración física R2 (`cms/<orgId>/x` → `<orgId>/cms/x`) — decisión: corte limpio, sin script → sigue en [[storage]].
- Re-subida de assets demo y `paymentMethodDetails` históricos → sigue en [[storage]].
- Retiro de `ai_usage.count` y `cache.increment` — aún pendientes → sigue en [[ai-chat]].
- Auditoría histórica del doble periodo (SELECT manual, sin auto-corregir) → sigue en [[pagos-suscripciones]].
- Compensación y periodo servidor del panel → [[FS-0002]] (draft, no cubierta por esta task).

## Notas

- Verificación 2026-09-20 contra código (subagentes explore): storage S1 cumplido, AI compat parcial (solo `count` + `increment` pendientes), front-load fix cumplido.
- [[FS-0001]] ya cubre: gating fiscal C2 (código), migración `0018`, snapshot emisor C1 y C9 E2E — por eso esos no entran aquí sino que se enlazan directo desde el backlog.
- 1 task = 1 PR no aplica aquí: es task de regularización documental, sin cambios de código.

## Plan de ejecución

> Task documental ya cerrada; sin `plan.md`/`phases/` de implementación.
