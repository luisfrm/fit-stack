# Estados de pago — significado y efectos (Panel vs Console)

> Documento interno de referencia. **Ningún estado de pago se elimina: se anula.**
> Alcance: **Panel** (organización/gym → miembro, tabla `payment`) y **Console** (FitStack → organización, tabla `platform_subscription_payment`).
> Documentos relacionados: `docs/ORGANIZATION_RECEIPT_MODEL.md`, `docs/FACTURATION.md`, `docs/CHECKLIST-COMPROBANTES.md`.

## 0. Lo primero: mismo vocabulario, distinta máquina de estados

Los **códigos** son un único contrato (`PAYMENT_STATUSES` en `packages/shared/src/constants.ts`) y ambas apps los usan. Pero **no son el mismo flujo**:

- Las dos aceptan `processing | validated | invalid | voided` para registrar y para cambiar el estado de un pago.
- **Console** acepta además `pending` y `refunded` (la API sí; la UI del Console no los ofrece).
- **Panel** nunca usa `pending` ni `refunded` (`z.enum(['processing','validated','invalid','voided'])` en `subscriptions.route.ts` y `payments.route.ts`).
- El efecto de un mismo código **no es el mismo** en las dos apps (ver §2): sobre todo `voided`, que en Panel además anula la suscripción y en Console no toca la suscripción.

## 1. Vocabulario (única fuente: `PAYMENT_STATUSES`)

| Código | Significado | Quién lo produce | Efecto |
|---|---|---|---|
| `pending` | Factura/registro emitido, **esperando el pago** | **Solo Console** (API: alta, renovación, cambio de plan, registro manual de pago). La UI del Console no lo ofrece hoy | Ninguno: todavía no hay dinero cobrado. En Console cuenta como "pendiente" para bloquear un segundo pago y para el estado computado de la suscripción SaaS |
| `processing` | **Pago recibido, esperando validación** | Panel: alta con el toggle "validar pago" apagado (**Por validar**). Console: `POST /api/organizations/subscription/renew` (autoservicio del gym) y registros manuales (**Procesando**) | No emite comprobante ni mueve el periodo. En Console bloquea registrar otro `pending`/`processing` en la misma suscripción (`hasPendingPayment`) |
| `validated` | **Pago confirmado** | Ambas | **Panel**: asigna el número de comprobante (paso 1) y encola el PDF (paso 2); el email sale del paso 2. **Console**: extiende `current_period_end` de forma **acumulativa** y asigna el `FS-N` |
| `invalid` | **Pago rechazado / inválido** | Ambas | **Panel**: la suscripción pasa a **ANULADA** (`voided`) y se marca `cancelled_at`. **Console**: solo cambia el estado del pago; **no** toca `receiptVoided` ni el periodo de la suscripción |
| `voided` | **Pago anulado** | Ambas | Conserva **número + PDF** y marca **ANULADO**; el número **nunca** se libera ni se reutiliza. **Panel**: además deja la suscripción **ANULADA**. **Console**: **no** cancela la suscripción ni revierte el periodo acumulado |

La respuesta de un PATCH que anula **dice qué pasó con el comprobante** (nunca un 200 mudo): `receiptVoided: true` si se marcó ANULADO, o `receiptVoided: false` + `receiptVoidReason: 'not_issued'` si el pago no tenía número. El código `RECEIPT_NOT_ISSUED` es contrato **interno** del servicio (`mark*ReceiptVoided`), no del endpoint. Ver §5.
| `refunded` | **Reservado, no implementado** | Console (el enum lo acepta; no hay UI ni servicio que lo produzca) | Ninguno hoy. Por diseño **no** toca el flag ANULADO |

> Regla de oro del flag ANULADO: **solo `voided` lo enciende**. `invalid`, `refunded` y `pending` no lo tocan.

## 2. Efectos, lado a lado

| Código | Panel — `payment` (gym) | Console — `platform_subscription_payment` (SaaS) |
|---|---|---|
| `pending` | No se usa | Aceptado por la API; bloquea otro pendiente; cuenta para el estado computado |
| `processing` | "Por validar": aparece en el accionable de `/payments` y no numera | "Procesando": bloquea otro pendiente; a la espera de que soporte apruebe |
| `validated` | Numera comprobante (`{slug}-año-n`) + encola render | Suma el periodo del plan a `current_period_end` + numera `FS-N` |
| `invalid` | La suscripción queda **ANULADA**; sin comprobante nuevo | Solo el estado; el comprobante emitido (si lo había) **no** se marca ANULADO |
| `voided` | **ANULADO** + suscripción **ANULADA** | **ANULADO**; la suscripción sigue igual (ni cancelada ni sin periodo) |
| `refunded` | No se usa | Aceptado, sin efectos |

### 2.1 El caso `$0` (Console)

Un trial o un plan `price = 0` **fuerza** `status = validated` con `paymentMethod = 'trial' | 'free'`: es un pago válido pero **`pre_system`** para el comprobante (`available:false`, `reason:'pre_system'`). Ni el trial ni el free queman un número de la serie `FS-N`.

## 3. Flujo Panel (gym)

1. **Alta** — `POST /api/subscriptions` (owner/manager/cashier). Crea la suscripción **y** su pago; el estado inicial lo decide el cajero con el toggle "validar pago" (`validated` por defecto, `processing` si lo deja por revisar).
2. **Aprobación** — `PATCH /api/payments/:id/status` con `validated`: numera el comprobante si aún no lo estaba y encola el render.
3. **Rechazo** — `PATCH …` con `invalid`: el cobro no vale y la suscripción queda **ANULADA**.
4. **Anulación** — `PATCH …` con `voided`: el comprobante pasa a **ANULADO** (con número y PDF intactos) y la suscripción queda **ANULADA**.
5. **Revocar / restaurar acceso** — `PUT /api/subscriptions/:id` con `{ status: 'cancelled' | 'active' }`: mueve `cancelled_at`, **no** toca el pago. Si el cobro está anulado o rechazado la acción no se ofrece (el status derivado manda: ANULADA gana sobre CANCELADA).
6. **No hay DELETE**: ni ruta, ni permiso RBAC (`subscriptions.delete` no existe), ni acción en el panel. Un registro equivocado se **anula**.

Estados **derivados** de la suscripción (SQL, no se guardan — `subscriptions.repository.ts`):

```
cobro voided/invalid  → voided     (ANULADA: el registro es inválido)
cancelled_at IS NOT NULL → cancelled (CANCELADA: se revocó el acceso, el cobro vale)
end_date < now()      → expired    (EXPIRADA)
resto                 → active     (ACTIVA)
```

`expiring` ("Por vencer") **no** es un estado de fila: es solo un filtro (pagada, no revocada, vence en ≤7 días).

## 4. Flujo Console (SaaS)

1. **Alta** — `POST /api/platform/subscriptions` (admin/owner): puede nacer validada o pendiente según el estado que envíe la consola.
2. **Autoservicio del gym** — `POST /api/organizations/subscription/renew` (owner/manager del gym): el pago nace **`processing`** y queda "en revisión". Todo lo financiero lo dicta el backend (snapshot del plan, tasa, importe).
3. **Aprobación** — `PATCH /api/platform/subscriptions/payments/:id/status` con `validated`: extiende el periodo acumulativo y numera el `FS-N`.
4. **Rechazo / Anulación** — el mismo PATCH con `invalid` ("Marcar como Rechazado") o `voided` ("Anular").
5. **Registro manual** — `POST /api/platform/subscriptions/:id/payments`: alta de un pago fuera del flujo de autoservicio.
6. **Comprobante** — `GET .../payments/:id/receipt` (contrato de 3 estados: `ready` / `pending` / `available:false`) y `/receipt/pdf`. Lectura: `subscription:list` (soporte también). Escrituras (validar, anular, reenviar): `requirePlatformAuth` (soporte **403**).
7. **Diferencia deliberada**: `DELETE /api/platform/subscriptions/:id` **sí existe** en Console (borra la suscripción SaaS y sus pagos por cascada) — es una decisión distinta de la del Panel y arrastra el histórico de la serie `FS-N` si ya había números emitidos. Ver `docs/PENDING.md` §13.

## 5. Invariantes (válidas en las dos apps)

- **El número nunca se reutiliza**: un comprobante anulado conserva su número y su PDF; no se libera, no se renumera.
- **El flag ANULADO lo enciende solo `voided`** (nunca `invalid` ni `refunded`).
- **El actor queda registrado** (`issued_by` / `voided_by`) — nunca inventado por el paso 2 ni por el barrido.
- **El emisor queda congelado** en el snapshot al emitir: editar la organización después no cambia el comprobante ni su fila del libro.
- **Un registro financiero no se elimina** (Panel): se anula.
- **Anular es explícito**: `receiptVoided` (+ `receiptVoidReason`) en el body del PATCH y toast diferenciado en Panel y Console.
- **Nada pendiente se pierde en silencio**: el barrido de `jobs-worker` re-encola tanto *numerado sin PDF* como *PDF listo sin notificar*; el email que agota reintentos y cae a la DLQ queda como recuperación manual (ver `docs/PENDING.md` §14).

## 6. Dónde vive cada cosa

| Tema | Archivo |
|---|---|
| Vocabulario | `packages/shared/src/constants.ts` (`PAYMENT_STATUSES`) |
| Estados derivados de la suscripción (Panel) | `apps/api-worker/src/repositories/subscriptions.repository.ts` |
| Estados computados de la suscripción SaaS | `apps/api-worker/src/repositories/platform-subscriptions.repository.ts` |
| Transiciones Panel | `apps/api-worker/src/services/subscriptions.service.ts`, `routes/payments.route.ts` |
| Transiciones Console | `apps/api-worker/src/services/platform-subscriptions.service.ts`, `routes/platform-subscriptions.route.ts` |
| Badges Panel | `apps/panel/components/payments/subscriptions-table.tsx` |
| Badges Console | `apps/console/components/platform/platform-payment-history-modal.tsx` |
