# FS-0002 — índice de fases

> Plan maestro en `../plan.md`. Orden de ejecución y dependencias; cada fase trae archivos, criterio de "done" y verificación.

## Orden recomendado

1. **Fase 0** (`fase-0-db-0019.md`) — columna `subscription.end_date_override_reason` (migración 0019) + repo. Sin dependencias salvo la rama apilada con 0018. Bloquea fase-4 (persistir el motivo).
2. **Fase 1** (`fase-1-shared-periodo.md`) — `computeSubscriptionPeriod` puro en `@workspace/shared` + unitarios. Sin dependencias. Bloquea fase-4 (cálculo servidor) y fase-5 (preview).
3. **Fase 2** (`fase-2-compensacion-panel.md`) — helper `subscription-compensation.ts` + B3.1 en `subscriptions.service.create` + 3 tests. Requiere fase-1 (nada del periodo, pero el helper nace aquí y su firma bloquea fase-3).
4. **Fase 3** (`fase-3-compensacion-saas.md`) — B3.2 en los 4 flujos de `platform-subscriptions.service.ts` + 3 tests. Requiere fase-2 (firma del helper).
5. **Fase 4** (`fase-4-periodo-servidor.md`) — B3.3: `POST /api/subscriptions` autoritativo (validación + cálculo + persistencia) + 6 tests. Requiere fase-0 (columna) + fase-1 (helper puro).
6. **Fase 5** (`fase-5-form-panel.md`) — `subscription-form.tsx`: sin `endDate` por defecto, preview compartido, motivo condicional, toasts por código. Requiere fase-1 + fase-4 (contrato 422).
7. **Fase 6** (`fase-6-docs-cierre.md`) — `AGENTS.md`, README del endpoint, PENDING + verificación global. Requiere fase-0…5.
8. **Fase 7** (`fase-7-cierre.md`) — cierre administrativo (C1–C6): test rojo, deriva de docs, contratos, verificación, E2E, checkboxes.
9. **Fase 8** (`fase-8-correcciones-review.md`) — correcciones post-review: 2 bloqueantes del helper de compensación (fail-closed real + revert gateado) y 4 follow-ups (changePlan, caché en `finally`, panel por código 422, `accumulated`). Requiere fase-0…7.
10. **Fase 9** (`fase-9-alineacion-ui-guards.md`) — post-review 2: alinear las UIs con los guards nuevos (F1 console sin acción muerta, F2 un solo dueño del toast) y cerrar la asimetría del PATCH del panel (F3, Opción A: guards espejo + repo `findById` + helper `businessError`). Requiere fase-3 y fase-8.

## Mapa de módulos por capa

| Capa | Archivos que se tocan (total de la task) |
|---|---|
| `packages/shared` | `src/subscription-period.ts` (nuevo: `computeSubscriptionPeriod` puro) · `src/index.ts` (re-export) · `tests/subscription-period.test.ts` (nuevo) |
| `packages/database` | `src/schema.ts` (`subscription.end_date_override_reason`) · `migrations/0019_*.sql` (nueva, aditiva nullable, sin backfill) |
| `apps/api-worker` | `src/lib/subscription-compensation.ts` (nuevo: helper con closures) · `src/services/subscriptions.service.ts` (B3.1 + B3.3 + guards espejo del PATCH, fase 9) · `src/services/platform-subscriptions.service.ts` (B3.2, 4 sitios) · `src/routes/subscriptions.route.ts` (schema B3.3) · `src/repositories/subscriptions.repository.ts` (persistir/exponer motivo + `findById` mínimo, fase 9) · `tests/integration/subscriptions-compensation.test.ts` + `platform-subscriptions-compensation.test.ts` + `subscriptions-period.test.ts` (nuevos) + `subscriptions.test.ts` (guards, fase 9) |
| `apps/panel` | `components/payments/subscription-form.tsx` (preview + motivo; sin toast de submit, fase 9) · `components/payments/subscription-modal.tsx` (dueño único del toast) · `components/payments/subscriptions-table.tsx` + `app/(protected)/payments/payments-client.tsx` (acciones alineadas a los guards, fase 9) |
| `apps/console` | `components/platform/platform-payment-history-modal.tsx` (solo `processing` + toast por código, fase 9) |
| Docs | `AGENTS.md` (regla de compensación + contrato del periodo + columna 0019) · README del endpoint en `apps/api-worker` · `vaults/backlog/pagos-suscripciones.md` §1 (ajuste: atomicidad compensada) |

## Decisiones congeladas (de `../plan.md`, no re-discutir por fase)

Compensación por relectura (nunca por tipo de error) · numerado = éxito + barrido · pago sin número = `voided` con motivo fijo (sin `cancel` adicional en panel) · sin pago = `cancel` de la huérfana (nunca `delete`) · periodo SaaS extendido se revierte al valor previo (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender) · `endDate` explícito solo pide motivo si acorta periodo vigente · `NULL` = calculado o histórico · sin transacciones interactivas · toasts por código.

## Reglas de ejecución

- `pnpm db:generate` → revisar SQL → `pnpm db:migrate` con aprobación; prohibido `db:push` en ramas compartidas.
- Timezone siempre de la org (`requireOrgTimezone`); dinero en centavos enteros; toasts vía `mutationError` + `apiCode`, nunca texto crudo.
- Cada fase cierra con `pnpm typecheck` (+ `lint`/`test` donde aplique); la verificación global vive en fase-6.
