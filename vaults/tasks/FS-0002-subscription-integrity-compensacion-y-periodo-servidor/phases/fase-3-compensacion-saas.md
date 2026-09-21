# Fase 3 — B3.2: la misma compensación en los 4 flujos SaaS

> Requiere: fase-2 (firma de `compensateFailedEmission`). Commit: `fix(api-worker): same compensation in the four SaaS payment flows + tests`.

## Objetivo

Aplicar el helper de fase-2 en `services/platform-subscriptions.service.ts` para que ningún flujo SaaS deje un cobro válido sin comprobante ni facture dos veces al reintentar. Semántica SaaS: el alta sin pago válido anula la suscripción con `cancel()` (nunca `delete()` — regla 6 y `vaults/backlog/pagos-suscripciones.md` §2) — **también en el alta con pago creado pero anulado**, porque un `voided` se ignora en `computePlatformSubscriptionStatus` y dejaría un periodo front-loadeado sin cobro (enmienda ratificada); renovación/cambio/registro anulan el pago y **revierten el periodo** al valor leído antes de extender; un pago `voided` no puede re-validarse.

## Crear

| Archivo | Contenido |
|---|---|
| `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts` | 3 tests (ver criterios). |

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/platform-subscriptions.service.ts` | Envolver la emisión en los 4 sitios con `assignPlatformReceiptNumber` — alta (`createSubscriptionWithPayment`, ~227), renovación (`renewSubscription`, ~294), registro (`registerPayment`, ~433) y transición a validado (`updatePaymentStatus`, ~543) — con closures de plataforma. `changePlan` hereda vía `createSubscriptionWithPayment` (su `cancel` previo de la anterior no se revierte: documentar en el comentario). `renewOrgSubscription` es `processing` y no emite: sin compensación (solo `setPayerIfMissing`, que no falla el cobro). |

## No tocar

- `services/platform-receipts.service.ts` (el paso 1 SaaS no cambia; `skipped:true` de trial/free `$0` = éxito, no compensa: no hay documento).
- `platform_subscription_payment.status` y el cómputo `EXISTS(validated|refunded)`: un pago compensado queda `voided` y por tanto no sostiene periodo (coherente con el status ignorando `voided`).
- `DELETE /api/platform/subscriptions/:id`: la compensación usa `cancel()`, jamás el DELETE (no vaciar la serie `FS-N`).

## Detalle

Closures de plataforma por sitio:

- `readPayment`: `platformSubsRepo.findPaymentById(paymentId)` → `receiptNumber`.
- `voidPayment`: `platformSubsRepo.updatePaymentStatus(paymentId, 'voided', { voidedBy: opts?.by, voidReason: 'Compensación: fallo al emitir el comprobante' })`. Sin `markPlatformReceiptVoided` adicional: sin número no hay comprobante que anular (el 200 con `receiptVoided:false` es contrato de la ruta de status, no de este flujo).
- `cancelParent` (solo alta): `platformSubsRepo.cancel(subscriptionId, 'Compensación: fallo al emitir el comprobante')` cuando el pago no llegó a crearse, y también tras anular el pago (enmienda ratificada: un `voided` se ignora en el status SaaS y dejaría el periodo fantasma). En renovación/registro/validación no hay `cancelParent`: la suscripción preexiste y el periodo extendido se revierte con `revertEffect` (`updatePeriodEnd(previousPeriodEnd)`, leído antes de extender) — el comentario en cada sitio lo declara. Un pago `voided` no puede re-validarse (`PATCH status` lo rechaza).

Caso `committed` (relectura con número): responder éxito con `{ subscriptionId, paymentId }` / `{ newPeriodEnd, paymentId }` según el flujo, igual que fase-2. Caso `compensated`: re-lanzar el original.

## Criterio de done

- Tests (3): (a) alta SaaS con fallo de emisión inducido → pago `voided` con motivo + suscripción `cancelledAt` no nulo, sin número `FS-N` consumido; reintento → sin duplicar (una sola suscripción activa + un solo cobro válido); (b) renovación con fallo → pago `voided` y `currentPeriodEnd` intacto (igual al calculado antes del fallo); (c) `registerPayment` o transición con fallo → pago `voided`, periodo y suscripción sin revertir, reintento limpio.
- Garantía visible en cada test: ningún cobro `validated|refunded` sin `receiptNumber` (salvo trial/free `$0`, que quedan `pre_system` por diseño).

## Verificación

- `pnpm --filter api-worker test:integration -- platform-subscriptions-compensation` + regresión `platform-receipts-*`, `platform-subscription-status`, `org-billing`; `pnpm typecheck`; `pnpm lint`.
