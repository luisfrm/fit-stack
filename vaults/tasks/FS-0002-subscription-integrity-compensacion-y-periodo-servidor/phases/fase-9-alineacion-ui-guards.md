# Fase 9 — Alineación UI ↔ API de los guards de transición de pago

> Cierre correctivo **post-review 2**. La auditoría del change set sin commitear detectó que los guards nuevos del backend dejaban UIs ofreciendo acciones que el servidor ya rechaza (un defecto de consistencia, no de datos) y una asimetría real entre console y panel. Se corrige en la **misma task y PR** (1 task = 1 PR).

## Origen

Al añadir los guards de la invariante *validado ⇔ numerado* (fase 3 SaaS: `PAYMENT_NOT_REVALIDATABLE` / `SUBSCRIPTION_CANCELLED`) el contrato del backend cambió, pero las apps no se alinearon:

| # | Hallazgo | Severidad | Efecto |
| --- | --- | --- | --- |
| **F1** | `platform-payment-history-modal.tsx` mostraba "Marcar como Validado" con `p.status !== VALIDATED`, o sea también para `voided`/`refunded` | Consistencia (defecto) | Acción muerta: siempre 409 + toast genérico |
| **F2** | El submit del panel toasteaba en el modal **y** en el form → doble toast (y en `END_DATE_BEFORE_START`, dos mensajes distintos) | UX (defecto menor) | 1 acción → 2 toasts |
| **F3** | El PATCH del panel (`/api/payments/:id/status`) no tenía los guards espejo: un `voided` podía re-validarse por API y nacer `validated` + numero sobre una suscripción cancelada | **Integridad (agujero real por API)** | Misma clase de incoherencia que FS-0002 cerró en console |

## Correctivos

### F1 — Console

- `show: canChangeStatus && p.status === PAYMENT_STATUSES.PROCESSING` (la única transición que el backend acepta).
- Toasts por **código** (`apiCode`) para `PAYMENT_NOT_REVALIDATABLE` y `SUBSCRIPTION_CANCELLED`; el resto sigue con `mutationError`.
- Camino de recuperación ya existente y sin cambios: tras un fallo compensado se registra un **pago nuevo** (`onRegisterPayment`), que es lo que prueba el caso `(c)` de `platform-subscriptions-compensation.test.ts`.

### F2 — Un solo dueño del toast

- El **modal** (`SubscriptionModal`) posee el toast del submit (ya mapeaba ambos códigos); el **form** quedó solo con su responsabilidad de estado (forzar el campo motivo + refrescar el `latestSubscription`).
- `SubscriptionForm` se usa únicamente dentro de `SubscriptionModal` (verificado), así que no queda consumidor sin feedback.
- Con esto desaparece **también** el duplicado preexistente en errores no relacionados con el periodo.

### F3 (Opción A — cerrar el agujero, no documentarlo)

Contrato espejo del console, **antes** de escribir el estado:

- `→ validated` con `previous.status !== 'processing'` → **409 `PAYMENT_NOT_REVALIDATABLE`**.
- `→ validated` con la suscripción padre cancelada → **409 `SUBSCRIPTION_CANCELLED`** (fail-closed: no se persiste nada).
- `subscriptions.repository.ts`: método **`findById(organizationId, id)`** mínimo (`id` + `cancelledAt`) — un read acotado en vez de reutilizar `findAllVisible` (JOIN completo) o `findLatestForMember` (semántica equivocada: devolvería otra suscripción del miembro).
- `periodError` se generalizó a **`businessError(status, code, message)`** (409 o 422): un solo helper para el patrón `{ error, code }` con `res` propia, en vez de dos casi idénticos.

UI del panel alineada al contrato nuevo (si no, se repetiría F1):

- `subscriptions-table.tsx`: "Validar Pago" se oculta con `sub.status` cancelado o anulado.
- `payments-client.tsx`: los 2 códigos se mapean en **los dos** sitios que validan un pago — `handlePaymentStatusChange` (tabla) y `handlePendingAction` (accionable "Por validar", que puede traer el pago de una sub revocada).

## Tests

`apps/api-worker/tests/integration/subscriptions.test.ts` → describe **"Guards de transición de pago (invariante validado ⇔ numerado)"**:

1. `voided → validated` → 409 `PAYMENT_NOT_REVALIDATABLE`, el pago sigue `voided` y sin número.
2. `processing` de una sub revocada → 409 `SUBSCRIPTION_CANCELLED`, el pago sigue `processing` y sin número.
3. `processing → validated` sigue funcionando y **numera una sola vez** (re-PATCH idempotente).

Ninguna suite ni E2E re-validaba un `voided` (verificado), así que no hubo expectativas que ajustar.

## Criterio de done

- [x] F1: la acción de validar no se ofrece fuera de `processing` y el toast se mapea por código.
- [x] F2: 1 acción de submit → 1 toast (dueño único = modal).
- [x] F3: 409 con código en los dos casos + estado no mutado (verificado por SQL en el test).
- [x] F3-UI: los 2 sitios que validan un pago respetan el contrato y explican el motivo por código.
- [x] Docs: `AGENTS.md` (fila `/api/payments`) + README de api-worker (PATCH del panel con los 2 códigos).
- [x] `pnpm typecheck` 9/9 · `pnpm lint` 0 errores · unitarios (shared/panel/console/jobs-worker/api-worker).

## Fuera de alcance

- Montar `POST /api/platform/subscriptions/change-plan` (ruta muerta preexistente, ya documentada en el servicio).
- Endurecer `paymentCreated === true && paymentId == null` en la compensación del panel (hoy imposible: el repo devuelve `.returning()`).
- Retirar `accumulated`/`baseline` de `computeSubscriptionPeriod` (hoy solo los consume el test, pero son contrato documentado de la regla).
