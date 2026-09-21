---
id: FS-0002
aliases: ["FS-0002"]
title: "Subscription integrity - compensacion y periodo servidor"
status: in_progress # draft | planning | in_progress | blocked | done | cancelled
priority: high # low | medium | high | critical
created: 2026-09-20
depends_on: [FS-0001] # hereda migración 0018 + snapshot de duración (rama stacked sobre fix/receipt-emission-integrity)
pr: null # URL del PR cuando exista
---

# FS-0002 — Subscription integrity: compensación y periodo servidor

## Problema

El alta de suscripción del panel commitea en **3 pasos sin transacción** (`subsRepo.create` → `paymentsRepo.create` → `assignReceiptNumber` en `subscriptions.service.ts`). Un fallo en el 3.º deja commiteados suscripción + pago `validated` **sin número**: el cliente ve error, el operador reintenta y se crea un **segundo periodo con un segundo cobro** (el guard de duplicados solo bloquea `processing`). Un fallo en el 2.º deja una **suscripción sin pago**: periodo con acceso y sin cobro que ninguna pantalla señala.

El mismo patrón de 3 pasos sin red se repite en Console en **4 flujos SaaS** (`platform-subscriptions.service.ts`: alta, renovación, cambio de plan y registro de pago — líneas 197/221, 287/294, 346, 420/433, 543): ahí el duplicado factura la suscripción SaaS dos veces.

Además, el periodo acumulativo (Regla 4: ningún día pagado se pierde) hoy es una **convención de UI**: `subscription-form.tsx:197-215` lee `latestSubscription.endDate`, suma la duración y manda el `endDate`; el servidor solo lo parsea (`subscriptions.service.ts:159-169`). Cualquier otro consumidor (API directa, E2E, portal del miembro, app móvil futura) puede acortar un periodo vigente y el backend no lo nota.

## Criterios de aceptación

### B3.1 — Compensación en el alta del panel

- [ ] Si `assignReceiptNumber` falla **después** del commit del número (relectura muestra `receiptNumber` persistido), **no se compensa**: se responde éxito (el predicado 1 del barrido re-encola el render en ≤15 min). Re-lanzar aquí provocaría el doble cobro que se evita.
- [ ] Si el pago quedó creado sin número, se **anula** (`voided` con `voidedBy`/`voidReason` = "Compensación: fallo al emitir el comprobante"), nunca se borra (regla 6). Al estar `voided` no da acceso ni cuenta como cobro; no se cancela además la suscripción (el status derivado `voided`/ANULADA ya gana sobre `cancelled`).
- [ ] Si el pago no llegó a crearse, se **cancela** la suscripción huérfana (`subsRepo.cancel`).
- [ ] La decisión se toma por **relectura** (`findById` tras el `catch`), nunca por el tipo de error. El error original se re-lanza para que `onError` traduzca el código (`lib/errors.ts:92` → `{error, code}` + status).
- [ ] El reintento queda limpio: el pago compensado es `voided` (no `processing`), el guard de duplicados no bloquea y la segunda intentona crea exactamente 1 periodo correcto.
- [ ] Tests de integración (3): fallo inducido con país fiscal inválido → sin 201, pago `voided` con motivo, sin número, sin hueco en la secuencia ni filas nuevas en el reporte de comprobantes; reintento posterior → exactamente 1 suscripción válida y 1 cobro; fallo en `payment.insert` simulado → suscripción cancelada, sin pago huérfano.

### B3.2 — Misma compensación en los 4 flujos SaaS

- [ ] `createSubscriptionWithPayment`, renovación, cambio de plan y registro de pago aplican el mismo helper con las closures de plataforma.
- [ ] Alta: si falla el 3.º, pago anulado **y la suscripción también se cancela** (no borrada: `platform_subscription` tiene `cancelledAt`). **Enmienda ratificada:** el spec original anulaba solo el pago, pero un `voided` se **ignora** en `computePlatformSubscriptionStatus`, así que el alta quedaría `past_due` con un periodo front-loadeado sin cobro que lo sostenga; cancelar la deja `cancelled` y evita el periodo fantasma (un reintento crea una segunda fila, con una sola activa).
- [ ] Renovación / cambio de plan / registro de pago: pago anulado **y el periodo extendido se revierte** (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender) — un write único honesto, sin transacción. Un reintento no acumula dos veces sobre el mismo cobro y el fallido no regala días.
- [ ] Un pago compensado (`voided`) **no puede re-validarse** (`PATCH status` lo rechaza): un re-PATCH no vuelve a extender el periodo sobre un cobro anulado ni deja un `validated` sin comprobante.
- [ ] Tests (3): alta SaaS con fallo de emisión → pago anulado + suscripción anulada, reintento sin duplicar; renovación con fallo → pago anulado y periodo revertido al valor previo; transición a validado con fallo → pago anulado + periodo revertido + re-PATCH rechazado.

### B3.3 — El periodo lo calcula el servidor (panel, solo `POST /api/subscriptions`)

- [ ] `startDate` pasa a opcional → default hoy local (`toLocalDayString(tz)`); `endDate` pasa a opcional → default calculado por el servidor.
- [ ] Sin `endDate`: el servidor calcula `addDuration(baseline, plan.durationValue, plan.durationUnit, tz)` con `baseline = (última vigente) ? max(latest.endDate, startDate) : startDate`, donde "vigente" es a **día local** (`latest.endDate >= inicio del día local`), no al instante.
- [ ] Con `endDate` igual al calculado: se acepta (idempotente, sin motivo).
- [ ] Con `endDate` menor habiendo periodo vigente: `422 END_DATE_OVERRIDE_REASON_REQUIRED` salvo que venga `endDateOverrideReason` → se acepta y el motivo se persiste en `subscription.end_date_override_reason`.
- [ ] Con `endDate` sin periodo vigente: se acepta libre (periodo nuevo a medida es legítimo, no hay días que perder).
- [ ] Guard nuevo: `endDate < startDate` → `422 END_DATE_BEFORE_START`.
- [ ] Función pura nueva en `@workspace/shared` (`computeSubscriptionPeriod`), consumida por el servidor y por el preview del panel (que deja de reimplementar la regla inline). Tests unitarios sin DB, estilo `date.ts`.
- [ ] Migración **0019** (aditiva, nullable): `subscription.end_date_override_reason`, sin backfill (`NULL` = periodo calculado o histórico).
- [ ] Frontend (mismo PR): el panel deja de mandar `endDate` por defecto; el preview usa el helper compartido; si el operador edita la fecha y acorta el periodo vigente aparece el campo motivo (obligatorio); toasts por código (`END_DATE_OVERRIDE_REASON_REQUIRED` / `END_DATE_BEFORE_START`) mapeados con `apiCode`.
- [ ] Compatibilidad: los llamadores que hoy mandan `endDate` de periodo nuevo (12 suites de integración, `e2e/seed.ts`, specs E2E) siguen funcionando sin cambios.
- [ ] Tests de integración (6): sin fechas → periodo = inicio + duración (mensual/semanal/diaria); renovación sobre periodo vigente → acumula desde `latest.endDate`; periodo vencido → no acumula (`baseline = startDate`); `endDate` que acorta sin motivo → 422 con código; con motivo → 201 y motivo persistido; `endDate < startDate` → 422.
- [ ] Revisar (no dar por bueno): tests acumulativos de `subscriptions.test.ts` (probablemente codifican el cálculo del cliente) y el E2E de renovación del panel.

### Verificación global

- [ ] `pnpm typecheck` (9/9) · `pnpm lint` (0 errores) · unitarios shared/panel/console/jobs-worker · integración: `subscriptions`, nuevas suites de compensación y periodo, `receipts-*`, `platform-receipts-*`, `dashboard`, `members-stats`, `org-billing` · E2E del flujo de renovación del panel.

## Alcance

| Capa                | Archivos / módulos |
| ------------------- | ------------------ |
| `packages/shared`   | `computeSubscriptionPeriod` (regla pura nueva) + tests unitarios estilo `date.ts` |
| `packages/database` | Migración **0019**: `subscription.end_date_override_reason` (nullable, sin backfill) + `schema.ts` + repo |
| `apps/api-worker`   | Helper compartido de compensación en `src/lib/` (closures `readPayment` / `voidPayment` / `cancelParent?`, devuelve `'committed' \| 'compensated'`) · `subscriptions.service.ts` (B3.1) · `platform-subscriptions.service.ts` 4 flujos (B3.2) · validación + cálculo + persistencia del periodo en `POST /api/subscriptions` (B3.3) · README del endpoint |
| `apps/panel`        | `subscription-form.tsx`: deja de mandar `endDate` por defecto, preview con helper compartido, campo motivo condicional, toasts por código (`apiCode`) |
| `apps/console`      | Sin cambios de UI (los 4 flujos SaaS son backend; el `PlatformPaymentHistoryModal` ya existe) |
| Docs                | `AGENTS.md` (regla de compensación + contrato del periodo + columna 0019), PENDING ajustado |

## Fuera de alcance

- Fila accionable de "validados sin comprobante" y flag `receiptVoided` en estado `pending` (diferidos de B1/B2).
- Datos históricos: el checklist de `docs/PENDING.md §5.2` (conteo + reparación con `/issue`) es operación, no código.
- Transacciones interactivas: siguen descartadas por el driver HTTP de Neon; la regla queda documentada.

## Notas

**Decisiones registradas (Fase B3 — plan final):**

1. Los 4 flujos de Console entran en el alcance de la compensación.
2. El motivo del override se persiste (migración 0019).
3. El `endDate` explícito solo pide motivo si acorta un periodo vigente.

**Rama y estrategia:** rama nueva desde `fix/receipt-emission-integrity` (stacked, sin mergear la anterior): hereda la migración 0018 y el snapshot de duración, que B3.3 necesita. Nombre propuesto: `fix/subscription-integrity`. **1 task = 1 PR.**

**Diagnóstico verificado:**

- `onError` ya traduce `ReceiptError` (`lib/errors.ts:92` → `{error, code}` + status): la compensación solo re-lanza.
- `findLatestForMember` ya excluye anuladas/canceladas (`subscriptions.repository.ts:281` — `cancelledAt IS NULL` + pago en `validated|processing`): el baseline acumulativo no necesita re-filtrar.
- Console ya es autoritativo en el periodo (`platform-subscriptions.service.ts:181-187`): B3.3 es solo panel, el console es el modelo a imitar.
- La cola no se compensa: si el pago quedó numerado, el predicado 1 del barrido lo recupera; compensar destruiría un comprobante válido.

**Orden de commits sugerido (7):**

1. `feat(database)`: persist the end date override reason (0019) — schema + migración + repo
2. `feat(shared)`: one rule for the cumulative subscription period — helper puro + tests unitarios
3. `fix(api-worker)`: compensate the gym subscription creation when emission fails + helper + tests
4. `fix(api-worker)`: same compensation in the four SaaS payment flows + tests
5. `feat(api-worker)`: the gym subscription period is authoritative on the server — validación, cálculo, persistencia + tests
6. `feat(panel)`: preview from the shared rule and override with reason — form + toast por código
7. `docs`: AGENTS.md (regla de compensación + contrato del periodo + columna 0019), README de api-worker (body del endpoint), PENDING ajustado

## Plan de ejecución

> Generado por el agente `planner` en `plan.md`; el detalle por fase vive en `phases/`.
