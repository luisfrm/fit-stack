# Estados de pago — significado y efectos (Panel vs Console)

> Documento interno de referencia. **Ningún estado de pago se elimina: se anula.**
> Alcance: **Panel** (organización/gym → miembro, tabla `payment`) y **Console** (FitStack → organización, tabla `platform_subscription_payment`).
> Documentos relacionados: [modelo de comprobante de la organización](./organization-receipt-model.md), [documentos fiscales](./fiscal-documents.md), [motor de comprobantes](../guides/receipt-engine.md), [checklist de release](../guides/release-checklist.md).

## 0. Un enum único, dos máquinas de estados

`PAYMENT_STATUSES` (`packages/shared/src/constants.ts`) es el **único** contrato de estados de pago:

```ts
PAYMENT_STATUSES = {
  PROCESSING: 'processing', // pago recibido, esperando revisión/validación
  VALIDATED:  'validated',  // pago confirmado
  VOIDED:     'voided',     // anulado o rechazado (ver getVoidKind)
  REFUNDED:   'refunded',   // reservado (no implementado)
}
```

Reglas del modelo unificado:

- `processing` **absorbe** al antiguo `pending`: es "pago para revisar". Ya no existe `pending` como estado de pago.
- El rechazo y la anulación son **el mismo estado de DB: `voided`**. Ya no existe `invalid`.
- **"Rechazado" vs "anulado" es derivado**, no un estado: `getVoidKind(payment)` (`@workspace/shared`) devuelve `rejected` cuando el pago `voided` **no** tiene `receiptNumber` y `annulled` cuando **sí** lo tiene. Un solo estado de DB + `void_reason`.
- `REFUNDED` está **reservado**: el enum y la columna `refunded_at` existen, pero hoy **ningún flujo lo produce** (la función de devolución se implementará después). Ver el backlog en Linear (proyecto «Fit Stack»).
- `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) es la fuente única de "este pago sostiene un periodo pagado". `processing` y `voided` **no califican**.

Los **códigos** son el mismo contrato en las dos apps, pero **no son el mismo flujo**: el efecto de un mismo código difiere (ver §2). Sobre todo `voided`, que en Panel además anula la suscripción y en Console se **ignora** en el status computado.

> No confundir el estado de pago con el estado del comprobante. El contrato del comprobante (`GET /:id/receipt`) tiene sus propios valores —`ready` / `pending` (202, PDF en preparación) / `pre_system` (`available:false`)— más el flag **ANULADO** del PDF. "PDF `pending`" es un estado del documento, no un estado de pago.

## 1. Vocabulario (única fuente: `PAYMENT_STATUSES`)

| Código | Significado | Quién lo produce | Efecto |
|---|---|---|---|
| `processing` | **Pago recibido, esperando validación** | Panel: alta con el toggle "validar pago" apagado (**Por validar**). Console: autoservicio del gym (`POST /api/organizations/subscription/renew`) y registros manuales (**Procesando**). **Nunca** es destino del PATCH (§1.1) | No emite comprobante ni mueve el periodo. Bloquea registrar otro `processing` en la misma suscripción (`hasPendingPayment`) |
| `validated` | **Pago confirmado** | Ambas | **Panel**: asigna el número de comprobante (paso 1) y encola el PDF (paso 2); el email sale del paso 2. **Console**: extiende `current_period_end` de forma **acumulativa** y asigna el `FS-N` |
| `voided` | **Pago anulado.** Según el comprobante emitido se deriva `rejected` (sin número) o `annulled` (con número) | Ambas | Conserva **número + PDF de emisión** (intactos) y, si ya estaba numerado, genera su **PDF con sello ANULADO**; el número **nunca** se libera ni se reutiliza. **Panel**: además deja la suscripción **ANULADA**. **Console**: se **ignora** en el status computado; **no** cancela la suscripción ni revierte el periodo acumulado |
| `refunded` | **Reservado, no implementado** | Nadie hoy (el enum y `refunded_at` existen; no hay UI ni servicio que lo produzca) | Ninguno hoy; **no** toca el flag ANULADO. Cuenta como pago calificado (`QUALIFYING_PAYMENT_STATUSES`) |

La respuesta de un PATCH que anula **dice qué pasó con el comprobante** (nunca un 200 mudo): `receiptVoided: true` si se marcó ANULADO, o `receiptVoided: false` + `receiptVoidReason: 'not_issued'` si el pago no tenía número. El código `RECEIPT_NOT_ISSUED` es contrato **interno** del servicio (`mark*ReceiptVoided`), no del endpoint. Ver §5.

Al anular se persisten **siempre** `voided_by` / `voided_at` / `void_reason`, haya o no comprobante (`updatePaymentStatus` en los repos de Panel y Console).

> Regla de oro del flag ANULADO: **solo `voided` lo enciende**. `refunded` no lo toca.

## 1.1 Transiciones legales del PATCH (RD-156)

El PATCH de estado —`PATCH /api/payments/:id/status` (Panel) y `PATCH /api/platform/subscriptions/payments/:id/status` (Console)— solo acepta **dos destinos**: `validated | voided` (+ `voidReason`, **obligatorio con `voided`**: sin motivo no vacío → **400 `VOID_REASON_REQUIRED`**, RD-163). Los enums de **alta**/renovación/registro manual no cambian (cada uno con su propio contrato: el alta del Panel sigue aceptando solo `processing | validated`; la del Console y el registro manual aceptan el enum completo): `processing` es un **estado de creación**, nunca un destino de PATCH.

| Origen (DB) | Destino | ¿Permitido? | Efecto |
|---|---|---|---|
| `processing` | `validated` | Sí | Aprueba: numera el comprobante; **Console** además extiende `current_period_end` **una sola vez** (duración del snapshot) |
| `processing` | `voided` | Sí | Anula un pago pendiente; sin número el contrato responde **200** con `receiptVoided:false` + `not_issued` |
| `validated` | `validated` | Sí (idempotente) | No renumera, **no re-extiende** ni reescribe auditoría |
| `validated` | `voided` | Sí | ANULADO (número y PDF de emisión intactos) y, en **Panel**, suscripción **ANULADA** |
| `voided` | `voided` | Sí (idempotente) | Conserva la **primera** anulación (`voided_by`/`void_reason` originales) |
| `voided` | `validated` | **No** → `409 PAYMENT_NOT_REVALIDATABLE` | Un pago anulado no se re-valida (su suscripción ya quedó anulada en Panel) |
| cualquiera | `processing` | **No** → `400` en el schema (backstop: `PAYMENT_STATUS_TRANSITION_INVALID`) | Reabría un cobro ya validado y regalaba el periodo dos veces revirtiendo el estado |

Por qué: con `validated → processing → validated` el segundo PATCH volvía a contar como "transición" y el Console **extendía el periodo otra vez** con el mismo pago. El destino `processing` queda prohibido en el **schema Zod** (400 sin tocar la fila) y el servicio repite el guard antes de escribir (**defensa en profundidad**: `400` con `code` estable). El guard del servicio también conserva el `409 PAYMENT_NOT_REVALIDATABLE` (`voided → validated`) y el `409 SUBSCRIPTION_CANCELLED` (validar sobre una suscripción cancelada), ambos resueltos por **código**, nunca por texto.

## 2. Efectos, lado a lado

| Código | Panel — `payment` (gym) | Console — `platform_subscription_payment` (SaaS) |
|---|---|---|
| `processing` | "Por validar": aparece en el accionable de `/payments` y no numera | "Procesando": bloquea otro pendiente; a la espera de que soporte apruebe |
| `validated` | Numera comprobante (`{año}-n`) + encola render | Suma el periodo del plan a `current_period_end` + numera `FS-N` |
| `voided` | **ANULADO** (si había número: PDF con sello, el de emisión deja de entregarse) + suscripción **ANULADA** | **ANULADO** (si había número); el status computado **lo ignora** y la suscripción sigue su curso por periodo/gracia |
| `refunded` | No se usa | Reservado, sin efectos |

### 2.1 Console: `voided` no revoca servicio; mandan el periodo y la gracia

El status SaaS (`platform-subscriptions.repository.ts`, espejo puro `computePlatformSubscriptionStatus`) usa `EXISTS(validated|refunded)` sobre **los pagos de la suscripción** (`QUALIFYING_PAYMENT_STATUSES`), nunca "el último pago":

- `cancelledAt IS NOT NULL` → `cancelled`.
- `currentPeriodEnd >= now` y **hay** pago calificado → `active`.
- `currentPeriodEnd >= now` y **no** hay pago calificado → `past_due`.
- Vencida: ≤7 días → `past_due`; ≤14 → `read_only`; más → `suspended`.

Un pago `voided` **se ignora por completo**: no cancela la suscripción, no revierte `current_period_end` y la gracia corre **desde `currentPeriodEnd`**. Los plazos **no son acumulables**: sin pago calificado al vencer la gracia, la suscripción se corta.

El guard de autoservicio (`POST /api/organizations/subscription/renew`) bloquea un segundo pago vigente solo si `currentPeriodEnd > now` **y** `hasValidatedPayment`; un cliente con periodo por delante pero **sin** pago calificado (p. ej. un pago anulado) puede **volver a pagar**.

### 2.2 Gate del free tier

Cuando el status SaaS no otorga acceso, decide el **free tier** (`features.service.ts`): si `feature_flags_free_tier_enabled === 'true'`, manda el piso gratuito (subs `PAST_DUE`/`READ_ONLY`/`SUSPENDED`/`CANCELLED` o sin sub → `isFreeTier: true`). Si no hay suscripción, se evalúa el free tier; si **no** está habilitado, aplica el comportamiento legacy y el panel redirige a `/no-subscription` (los tramos de gracia siguen mostrando el banner). Ver AGENTS.md → "Features & Free Tier".

### 2.3 El caso `$0` (Console)

Un plan `price = 0` **fuerza** `status = validated` con `paymentMethod = 'free'`: es un pago válido pero **`pre_system`** para el comprobante (`available:false`, `reason:'pre_system'`) y **no** quema un número de la serie `FS-N`. Su `plan_snapshot_price` es 0, así que nunca suma a los KPIs de ingresos.

**Los trials ya no existen (RD-117)**: `isTrial`, `trial_days` y el estado `trial` se retiraron del modelo (migración `0030` cierra los trials históricos con motivo `trials_removed` y convierte sus pagos a `payment_method = 'free'`). No hay estado `trial` que computar y no hay campo que rechazar. Los descuentos futuros serán **cupones** (hasta 100 %), no un plan a precio cero ni un `price_override`.

**El pago SaaS también lo cotiza el servidor (RD-161)**: ni el alta, ni la renovación, ni el registro manual aceptan `amountPaid`/`exchangeRateApplied` en el body. El servicio deriva monto y tasa del plan, y además persiste `platform_rate_applied` (plan → moneda primaria) y `platform_amount` (centavos en la primaria) para que el revenue nunca sume monedas distintas. Ver [`platform-billing.md`](./platform-billing.md).

## 3. Flujo Panel (gym)

1. **Alta** — `POST /api/subscriptions` (owner/manager/cashier). Crea la suscripción **y** su pago; el estado inicial lo decide el cajero con el toggle "validar pago" (`validated` por defecto, `processing` si lo deja por revisar).
2. **Aprobación** — `PATCH /api/payments/:id/status` con `validated` (el PATCH solo acepta `validated | voided`, ver §1.1): numera el comprobante si aún no lo estaba y encola el render.
3. **Anulación / Rechazo** — `PATCH …` con **`voided`** (estado único): el cobro no vale y la suscripción queda **ANULADA**. Si el pago ya estaba numerado, el comprobante pasa a **ANULADO** (número y PDF intactos); si no, no hay nada que marcar y el body lo dice (`not_issued`). La distinción "rechazado" (`rejected`) vs "anulado" (`annulled`) se **deriva** con `getVoidKind`.
4. **Revocar / restaurar acceso** — `PUT /api/subscriptions/:id` con `{ status: 'cancelled' | 'active' }`: mueve `cancelled_at`, **no** toca el pago. Si el cobro está anulado la acción no se ofrece (el status derivado manda: ANULADA gana sobre CANCELADA).
5. **No hay DELETE**: ni ruta, ni permiso RBAC (`subscriptions.delete` no existe), ni acción en el panel. Un registro equivocado se **anula**.

Estados **derivados** de la suscripción (SQL, no se guardan — `subscriptions.repository.ts`):

```
cobro voided             → voided     (ANULADA: el registro es inválido)
cancelled_at IS NOT NULL → cancelled (CANCELADA: se revocó el acceso, el cobro vale)
end_date < now()         → expired    (EXPIRADA)
resto                    → active     (ACTIVA)
```

`expiring` ("Por vencer") **no** es un estado de fila: es solo un filtro (pagada, no revocada, vence en ≤7 días).

## 4. Flujo Console (SaaS)

1. **Alta** — `POST /api/platform/subscriptions` (admin/owner): puede nacer `validated` o `processing`. Un plan `price = 0` usa el camino `free` (pago `validated` con montos cero); el monto y la tasa de cualquier otro plan los calcula el servidor (RD-161).
2. **Autoservicio del gym** — `POST /api/organizations/subscription/renew` (owner/manager del gym): el pago nace **`processing`** y queda "en revisión". Todo lo financiero lo dicta el backend (snapshot del plan, tasa, importe).
3. **Aprobación** — `PATCH /api/platform/subscriptions/payments/:id/status` con `validated` (el PATCH solo acepta `validated | voided`, ver §1.1): extiende el periodo (solo en la transición `processing → validated`, con la duración del **snapshot** del pago) y numera el `FS-N`.
4. **Anulación** — el mismo PATCH con **`voided`**: marca ANULADO si había comprobante y se **ignora** en el status computado (no cancela la suscripción). No existe `invalid`: el rechazo también es `voided`.
5. **Registro manual** — `POST /api/platform/subscriptions/:id/payments`: alta de un pago fuera del flujo de autoservicio.
6. **Comprobante** — `GET .../payments/:id/receipt` (contrato de 3 estados: `ready` / `pending` / `available:false`) y `/receipt/pdf`. Lectura: `subscription:list` (soporte también). Escrituras (validar, anular, reenviar): `console:manage` (soporte **403**).
7. **Diferencia deliberada**: `DELETE /api/platform/subscriptions/:id` **sí existe** en Console, pero **solo borra una suscripción sin pagos**. Si tiene pagos responde **409 `SUBSCRIPTION_HAS_PAYMENTS`** (la FK es `RESTRICT`) y la vía correcta es **cancelarla**, nunca borrarla: el histórico de la serie `FS-N` se conserva. En el Panel el DELETE **no existe** (ni ruta ni permiso `subscriptions.delete`): un registro equivocado se anula. Ver el backlog en Linear (proyecto «Fit Stack»).

### 4.1 Punto 7: sin doble periodo

Un alta con pago `processing` **no** front-loadea `current_period_end` (queda en `startDate`). Al validar se extiende **una sola vez** (solo en la transición `processing → validated`) con la duración del snapshot del pago. Así un pago que nace por revisar y se aprueba después no suma dos veces el periodo.

El destino `processing` está **prohibido** en el PATCH (§1.1): mandar un pago `validated` de vuelta a `processing` reabría esa transición y extendía el periodo por segunda vez con el mismo cobro.

## 5. Invariantes (válidas en las dos apps)

- **El número nunca se reutiliza**: un comprobante anulado conserva su número y su PDF; no se libera, no se renumera.
- **El flag ANULADO lo enciende solo `voided`** (nunca `refunded`).
- **El actor queda registrado** (`issued_by` / `voided_by`) — nunca inventado por el paso 2 ni por el barrido. Al anular se persisten siempre `voided_by` / `voided_at` / `void_reason`.
- **Anular exige motivo** (RD-163): `voided` sin un `voidReason` no vacío responde **400 `VOID_REASON_REQUIRED`** en el schema (la fila no se toca) y en el servicio (defensa en profundidad). El servidor nunca inventa "Pago anulado". En la UI el motivo lo escribe el operador en un prompt obligatorio (`ReasonPromptModal`): el campo arranca **vacío** (una sugerencia precargada solo movería el default al cliente) y el botón de confirmar queda deshabilitado mientras no haya texto; el tipo (rechazo/anulación) viaja como intención explícita, nunca se deduce del texto.
- **El emisor queda congelado** en el snapshot al emitir: editar la organización después no cambia el comprobante ni su fila del libro.
- **Un registro financiero no se elimina** (Panel): se anula — ver `AGENTS.md` → Business Rules Summary, regla 6.
- **Anular es explícito**: `receiptVoided` (+ `receiptVoidReason: 'not_issued'`) en el body del PATCH y toast diferenciado en Panel y Console.
- **Un solo estado de anulación**: rechazo y anulación son `voided`; su tipo (`rejected`/`annulled`) se **deriva** con `getVoidKind`, no se guarda.
- **`refunded` reservado**: no toca el flag ANULADO; su flujo de devolución está pendiente (Linear — proyecto «Fit Stack»).
- **Nada pendiente se pierde en silencio**: el barrido de `jobs-worker` cubre **cinco** estados — reclamo vencido, numerado sin PDF, PDF listo sin notificar, anulado sin PDF con sello y anulado sin flag. Un envío que agota reintentos limpia la marca de notificado, así que el barrido re-encola el aviso; si el fallo es de otra naturaleza, la recuperación es manual (`resend` / `POST /:id/issue`).
- **El ANULADO es un artefacto**: anular conserva el PDF de emisión intacto y genera uno nuevo con el sello (`<numero>-anulado.pdf` en `receipt_voided_pdf_key`). Mientras ese render no exista, el contrato responde `pending` y **el original no se descarga**: un comprobante anulado nunca viaja sin su sello. Tampoco se reenvía por email (`409 RECEIPT_VOIDED`).
- **RD-159 — manda el estado de pago, no el flag**: la entrega se decide con `status === PAYMENT_STATUSES.VOIDED`, no con `receipt_voided`. El flujo de anulación escribe `status = 'voided'` primero y el flag después; si la segunda escritura se pierde, el flag queda en `false` y recibir el `receipt_pdf_key` entregaría el PDF de emisión de un cobro anulado. Por eso `getReceiptState` (Panel y Console, `receipts.service.ts` / `platform-receipts.service.ts`) y el reenvío leen el **estado**: sin sello → `pending` (202) y `/receipt/pdf` → 404, y el reenvío → `409 RECEIPT_VOIDED`. `receipt_voided` es la **reparación del barrido** (estado 5): enciende solo el flag y encola el render del sello; el estado del pago nunca se toca.

## 6. Dónde vive cada cosa

| Tema | Archivo |
|---|---|
| Vocabulario + `getVoidKind` + `QUALIFYING_PAYMENT_STATUSES` | `packages/shared/src/constants.ts` |
| Estados derivados de la suscripción (Panel) | `apps/api-worker/src/repositories/subscriptions.repository.ts` |
| Status SaaS (SQL `EXISTS(validated\|refunded)`) | `apps/api-worker/src/repositories/platform-subscriptions.repository.ts` |
| Helper puro del status SaaS | `computePlatformSubscriptionStatus` (`packages/shared/src/constants.ts`) |
| Último contrato SaaS con `hasValidatedPayment` | `getLastSubscriptionStatus` (repo + service de `platform-subscriptions`) |
| Transiciones Panel | `apps/api-worker/src/services/subscriptions.service.ts`, `routes/payments.route.ts` |
| Transiciones Console | `apps/api-worker/src/services/platform-subscriptions.service.ts`, `routes/platform-subscriptions.route.ts` |
| Catálogo de códigos de error (toasts por `code`) | `packages/shared/src/errors.ts` (`API_ERROR_CODES`, p. ej. `PAYMENT_STATUS_TRANSITION_INVALID`) |
| Guard de autoservicio | `apps/api-worker/src/routes/organizations.route.ts` |
| Gate del free tier | `apps/api-worker/src/services/features.service.ts` |
| Badges Panel | `apps/panel/components/payments/subscriptions-table.tsx` |
| Badges Console | `apps/console/components/platform/platform-payment-history-modal.tsx` |

## 7. Notas de migración y release

- `platform_subscription_payment.status` tiene default `'processing'` (migración `0017`).
- Datos históricos normalizados: `pending → processing` e `invalid → voided`, marcando `receipt_voided`/`voided_at`/`void_reason` cuando la fila ya tenía `receipt_number`. `cancelled_at` no se toca.
- La migración se aplica **antes** del deploy del código nuevo; CI la corre al mergear. Tras el merge ninguna fila debe llevar `pending`/`invalid`.
- Comunicación a clientes: los PATCH con `pending`/`invalid` responden **400**; rechazo y anulación comparten `voided`; solo `validated | refunded` sostienen un periodo; en Console un `voided` se ignora; en Panel deja la suscripción ANULADA; `DELETE /api/subscriptions/:id` no existe; `refunded` sigue reservado.
