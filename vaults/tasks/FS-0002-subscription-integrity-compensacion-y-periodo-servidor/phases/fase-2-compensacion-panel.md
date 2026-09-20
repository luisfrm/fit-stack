# Fase 2 — B3.1: compensar el alta del panel cuando falla la emisión

> Requiere: fase-1 (no por el periodo, sino porque la firma del helper nace aquí y bloquea fase-3). Commit: `fix(api-worker): compensate the gym subscription creation when emission fails + helper + tests`.

## Objetivo

Cerrar los dos huecos del alta en 3 pasos (`subsRepo.create` → `paymentsRepo.create` → `assignReceiptNumber` en `services/subscriptions.service.ts:171-249`): ni segundo cobro por reintento, ni suscripción huérfana sin pago. Sin transacciones interactivas (driver HTTP de Neon): compensación explícita en el `catch`.

## Crear

| Archivo | Contenido |
|---|---|
| `apps/api-worker/src/lib/subscription-compensation.ts` | `compensateFailedEmission(err, closures)` + tipos. Sin dependencias de repos concretos (recibe closures) para reutilizar en SaaS. |
| `apps/api-worker/tests/integration/subscriptions-compensation.test.ts` | 3 tests (ver criterios). |

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/subscriptions.service.ts` | `create()`: rastrea `subscriptionId` / `paymentId \| null`; envuelve pago + emisión en `try/catch` que delega al helper; caso `committed` responde la suscripción (éxito); caso `compensated` re-lanza el original. Resto del método intacto (guard `processing`, parseo de fechas, snapshot de duración). |

## No tocar

- `services/receipts.service.ts` (el paso 1 no cambia; su idempotencia "ya numerado → devuelve existente" se aprovecha, no se duplica).
- `lib/errors.ts` (`onError` ya traduce `ReceiptError` y respeta `HTTPException` con `res`: la compensación solo re-lanza).
- La cola: si el pago quedó numerado, el predicado 1 del barrido re-encola el render (≤15 min). Compensar ahí destruiría un comprobante válido.

## Detalle

Firma del helper:

```ts
type CompensationOutcome = 'committed' | 'compensated';
interface CompensationClosures {
  readPayment: () => Promise<{ receiptNumber?: string | null } | undefined | null>;
  voidPayment: () => Promise<unknown>;
  cancelParent?: () => Promise<unknown>;
}
async function compensateFailedEmission(
  originalError: unknown,
  closures: CompensationClosures,
  opts: { paymentCreated: boolean },
): Promise<CompensationOutcome>
```

Decisión **por relectura**, nunca por tipo de error:

1. `paymentCreated === true` → `readPayment()` (`paymentsRepo.findById`).
   - Con `receiptNumber` persistido → `'committed'`: el número se commiteó antes del fallo (o un reintento idempotente lo completó). **No se compensa ni se re-lanza**: el servicio responde la suscripción con éxito. Re-lanzar aquí provocaría el doble cobro que se evita.
   - Sin número → `voidPayment()` (`paymentsRepo.updateStatus(voided, { voidedBy: opts?.by ?? null, voidReason: 'Compensación: fallo al emitir el comprobante' })`) → `'compensated'` → el servicio re-lanza el original. El pago queda `voided` (no `processing`): no da acceso, no cuenta como cobro y **no bloquea el reintento** (el guard solo frena `processing`). No se cancela además la suscripción: el status derivado `voided`/ANULADA ya gana sobre `cancelledAt`.
2. `paymentCreated === false` (falló `paymentsRepo.create`) → `cancelParent?.()` (`subsRepo.cancel`, huérfana cancelada, nunca borrada — regla 6) → `'compensated'` → re-lanza.
3. El `voided_by`/`void_reason` se persiste siempre en el pago (auditoría de anulación); `receiptVoided` lo maneja el repo de comprobantes como hoy.

Caché: el `POST /` ya invalida vía `invalidateSubscriptionDependentCaches` en éxito; en fallo compensado no hay estado válido nuevo que invalidar (el `voided` posterior se invalida en su propia ruta `PATCH /payments/:id/status`).

## Criterio de done

- Tests de integración (3): (a) fallo inducido con país fiscal inválido → respuesta de error (sin 201), pago `voided` con motivo de compensación, sin `receiptNumber`, sin hueco en la secuencia anual ni filas nuevas en `GET /api/reports/receipts`; (b) reintento posterior (fiscal corregido) → exactamente 1 suscripción válida y 1 cobro (conteo por `memberId`, sin duplicados); (c) fallo simulado en `payment.insert` → suscripción `cancelledAt` no nulo, ningún pago huérfano (`LEFT JOIN payment … WHERE p.id IS NULL` vacío para la suscripción).
- Dinero en centavos enteros en fixtures; tz de `requireOrgTimezone` (la que ya inyecta la ruta).

## Verificación

- `pnpm --filter api-worker test:integration -- subscriptions-compensation` + regresión `subscriptions` (revisar, no dar por buenos, los acumulativos que codifican el cálculo del cliente); `pnpm typecheck`; `pnpm lint`.
