# Estados de pago — significado y efectos (Panel vs Console)

> Documento interno de referencia. **Ningún estado de pago se elimina: se anula.**
> Alcance: **Panel** (organización/gym → miembro, tabla `payment`) y **Console** (FitStack → organización, tabla `platform_subscription_payment`).
> Documentos relacionados: `docs/ORGANIZATION_RECEIPT_MODEL.md`, `docs/FACTURATION.md`, `docs/CHECKLIST-COMPROBANTES.md`.

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
- `REFUNDED` está **reservado**: el enum y la columna `refunded_at` existen, pero hoy **ningún flujo lo produce** (la función de devolución se implementará después). Ver `docs/PENDING.md` §17.
- `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) es la fuente única de "este pago sostiene un periodo pagado". `processing` y `voided` **no califican**.

Los **códigos** son el mismo contrato en las dos apps, pero **no son el mismo flujo**: el efecto de un mismo código difiere (ver §2). Sobre todo `voided`, que en Panel además anula la suscripción y en Console se **ignora** en el status computado.

> No confundir el estado de pago con el estado del comprobante. El contrato del comprobante (`GET /:id/receipt`) tiene sus propios valores —`ready` / `pending` (202, PDF en preparación) / `pre_system` (`available:false`)— más el flag **ANULADO** del PDF. "PDF `pending`" es un estado del documento, no un estado de pago.

## 1. Vocabulario (única fuente: `PAYMENT_STATUSES`)

| Código | Significado | Quién lo produce | Efecto |
|---|---|---|---|
| `processing` | **Pago recibido, esperando validación** | Panel: alta con el toggle "validar pago" apagado (**Por validar**). Console: autoservicio del gym (`POST /api/organizations/subscription/renew`) y registros manuales (**Procesando**) | No emite comprobante ni mueve el periodo. Bloquea registrar otro `processing` en la misma suscripción (`hasPendingPayment`) |
| `validated` | **Pago confirmado** | Ambas | **Panel**: asigna el número de comprobante (paso 1) y encola el PDF (paso 2); el email sale del paso 2. **Console**: extiende `current_period_end` de forma **acumulativa** y asigna el `FS-N` |
| `voided` | **Pago anulado.** Según el comprobante emitido se deriva `rejected` (sin número) o `annulled` (con número) | Ambas | Conserva **número + PDF** y marca **ANULADO** si ya estaba numerado; el número **nunca** se libera ni se reutiliza. **Panel**: además deja la suscripción **ANULADA**. **Console**: se **ignora** en el status computado; **no** cancela la suscripción ni revierte el periodo acumulado |
| `refunded` | **Reservado, no implementado** | Nadie hoy (el enum y `refunded_at` existen; no hay UI ni servicio que lo produzca) | Ninguno hoy; **no** toca el flag ANULADO. Cuenta como pago calificado (`QUALIFYING_PAYMENT_STATUSES`) |

La respuesta de un PATCH que anula **dice qué pasó con el comprobante** (nunca un 200 mudo): `receiptVoided: true` si se marcó ANULADO, o `receiptVoided: false` + `receiptVoidReason: 'not_issued'` si el pago no tenía número. El código `RECEIPT_NOT_ISSUED` es contrato **interno** del servicio (`mark*ReceiptVoided`), no del endpoint. Ver §5.

Al anular se persisten **siempre** `voided_by` / `voided_at` / `void_reason`, haya o no comprobante (`updatePaymentStatus` en los repos de Panel y Console).

> Regla de oro del flag ANULADO: **solo `voided` lo enciende**. `refunded` no lo toca.

## 2. Efectos, lado a lado

| Código | Panel — `payment` (gym) | Console — `platform_subscription_payment` (SaaS) |
|---|---|---|
| `processing` | "Por validar": aparece en el accionable de `/payments` y no numera | "Procesando": bloquea otro pendiente; a la espera de que soporte apruebe |
| `validated` | Numera comprobante (`{slug}-año-n`) + encola render | Suma el periodo del plan a `current_period_end` + numera `FS-N` |
| `voided` | **ANULADO** (si había número) + suscripción **ANULADA** | **ANULADO** (si había número); el status computado **lo ignora** y la suscripción sigue su curso por periodo/gracia |
| `refunded` | No se usa | Reservado, sin efectos |

### 2.1 Console: `voided` no revoca servicio; mandan el periodo y la gracia

El status SaaS (`platform-subscriptions.repository.ts`, espejo puro `computePlatformSubscriptionStatus`) usa `EXISTS(validated|refunded)` sobre **los pagos de la suscripción** (`QUALIFYING_PAYMENT_STATUSES`), nunca "el último pago":

- `cancelledAt IS NOT NULL` → `cancelled`.
- `isTrial` y periodo vigente → `trial`.
- `currentPeriodEnd >= now` y **hay** pago calificado → `active`.
- `currentPeriodEnd >= now` y **no** hay pago calificado → `past_due`.
- Vencida: ≤7 días → `past_due`; ≤14 → `read_only`; más → `suspended`.

Un pago `voided` **se ignora por completo**: no cancela la suscripción, no revierte `current_period_end` y la gracia corre **desde `currentPeriodEnd`**. Los plazos **no son acumulables**: sin pago calificado al vencer la gracia, la suscripción se corta.

El guard de autoservicio (`POST /api/organizations/subscription/renew`) bloquea un segundo pago vigente solo si `currentPeriodEnd > now` **y** `hasValidatedPayment`; un cliente con periodo por delante pero **sin** pago calificado (p. ej. un pago anulado) puede **volver a pagar**.

### 2.2 Gate del free tier

Cuando el status SaaS no otorga acceso, decide el **free tier** (`features.service.ts`): si `feature_flags_free_tier_enabled === 'true'`, manda el piso gratuito (subs `PAST_DUE`/`READ_ONLY`/`SUSPENDED`/`CANCELLED` o sin sub → `isFreeTier: true`). Si no hay suscripción, se evalúa el free tier; si **no** está habilitado, aplica el comportamiento legacy y el panel redirige a `/no-subscription` (los tramos de gracia siguen mostrando el banner). Ver AGENTS.md → "Features & Free Tier".

### 2.3 El caso `$0` (Console)

Un trial o un plan `price = 0` **fuerza** `status = validated` con `paymentMethod = 'trial' | 'free'`: es un pago válido pero **`pre_system`** para el comprobante (`available:false`, `reason:'pre_system'`). Ni el trial ni el free queman un número de la serie `FS-N`.

## 3. Flujo Panel (gym)

1. **Alta** — `POST /api/subscriptions` (owner/manager/cashier). Crea la suscripción **y** su pago; el estado inicial lo decide el cajero con el toggle "validar pago" (`validated` por defecto, `processing` si lo deja por revisar).
2. **Aprobación** — `PATCH /api/payments/:id/status` con `validated`: numera el comprobante si aún no lo estaba y encola el render.
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

1. **Alta** — `POST /api/platform/subscriptions` (admin/owner): puede nacer `validated` o `processing`.
2. **Autoservicio del gym** — `POST /api/organizations/subscription/renew` (owner/manager del gym): el pago nace **`processing`** y queda "en revisión". Todo lo financiero lo dicta el backend (snapshot del plan, tasa, importe).
3. **Aprobación** — `PATCH /api/platform/subscriptions/payments/:id/status` con `validated`: extiende el periodo (solo en la transición `wasPending`, con la duración del **snapshot** del pago) y numera el `FS-N`.
4. **Anulación** — el mismo PATCH con **`voided`**: marca ANULADO si había comprobante y se **ignora** en el status computado (no cancela la suscripción). No existe `invalid`: el rechazo también es `voided`.
5. **Registro manual** — `POST /api/platform/subscriptions/:id/payments`: alta de un pago fuera del flujo de autoservicio.
6. **Comprobante** — `GET .../payments/:id/receipt` (contrato de 3 estados: `ready` / `pending` / `available:false`) y `/receipt/pdf`. Lectura: `subscription:list` (soporte también). Escrituras (validar, anular, reenviar): `requirePlatformAuth` (soporte **403**).
7. **Diferencia deliberada**: `DELETE /api/platform/subscriptions/:id` **sí existe** en Console (borra la suscripción SaaS y sus pagos por cascada) — es una decisión distinta de la del Panel y arrastra el histórico de la serie `FS-N` si ya había números emitidos. Ver `docs/PENDING.md` §13.

### 4.1 Punto 7: sin doble periodo

Un alta con pago `processing` **no** front-loadea `current_period_end` (queda en `startDate`). Al validar se extiende **una sola vez** (solo si `wasPending`) con la duración del snapshot del pago. Así un pago que nace por revisar y se aprueba después no suma dos veces el periodo.

## 5. Invariantes (válidas en las dos apps)

- **El número nunca se reutiliza**: un comprobante anulado conserva su número y su PDF; no se libera, no se renumera.
- **El flag ANULADO lo enciende solo `voided`** (nunca `refunded`).
- **El actor queda registrado** (`issued_by` / `voided_by`) — nunca inventado por el paso 2 ni por el barrido. Al anular se persisten siempre `voided_by` / `voided_at` / `void_reason`.
- **El emisor queda congelado** en el snapshot al emitir: editar la organización después no cambia el comprobante ni su fila del libro.
- **Un registro financiero no se elimina** (Panel): se anula.
- **Anular es explícito**: `receiptVoided` (+ `receiptVoidReason: 'not_issued'`) en el body del PATCH y toast diferenciado en Panel y Console.
- **Un solo estado de anulación**: rechazo y anulación son `voided`; su tipo (`rejected`/`annulled`) se **deriva** con `getVoidKind`, no se guarda.
- **`refunded` reservado**: no toca el flag ANULADO; su flujo de devolución está pendiente (`docs/PENDING.md` §17).
- **Nada pendiente se pierde en silencio**: el barrido de `jobs-worker` re-encola tanto *numerado sin PDF* como *PDF listo sin notificar*; el email que agota reintentos y cae a la DLQ queda como recuperación manual (ver `docs/PENDING.md` §14).

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
| Guard de autoservicio | `apps/api-worker/src/routes/organizations.route.ts` |
| Gate del free tier | `apps/api-worker/src/services/features.service.ts` |
| Badges Panel | `apps/panel/components/payments/subscriptions-table.tsx` |
| Badges Console | `apps/console/components/platform/platform-payment-history-modal.tsx` |

## 7. Migración `0017` y notas de release

La migración `packages/database/migrations/0017_crazy_brood.sql` (aditiva y retrocompatible) cierra la unificación:

- Fija el default de `platform_subscription_payment.status` en `'processing'` (antes `'pending'`).
- Normaliza datos históricos: `pending → processing` e `invalid → voided`, marcando `receipt_voided`/`voided_at`/`void_reason` cuando la fila tenía `receipt_number` (actor `voided_by` queda `NULL`). `cancelled_at` no se toca.
- Se aplica **antes** del deploy del código nuevo (los valores viejos siguen siendo válidos para el código previo). CI (`database-migrations.yml`) la corre en merge a `master`. Tras el merge, ninguna fila debe llevar `pending`/`invalid`.

**Cambios de comportamiento a comunicar:**

1. `PAYMENT_STATUSES = processing | validated | voided | refunded`. `pending` e `invalid` **se retiran**: los PATCH que los envíen responden **400**.
2. El rechazo y la anulación comparten `voided`; su tipo (`rejected`/`annulled`) se **deriva** con `getVoidKind`.
3. Solo `validated | refunded` (`QUALIFYING_PAYMENT_STATUSES`) sostienen un periodo.
4. **Console/SaaS**: un pago `voided` **se ignora** (ya no revoca servicio); una org con pago `processing` y periodo vigente pasa de `active` a **`past_due`**.
5. **Panel**: un pago `voided` deja la suscripción **ANULADA**.
6. `DELETE /api/subscriptions/:id` sigue **sin existir**: se anula o se cancela.
7. `refunded` permanece reservado (sin flujo que lo produzca, `docs/PENDING.md` §17) y no enciende el flag ANULADO.
