# Backlog — Pagos y suscripciones

> Atomicidad del registro financiero, borrado de suscripción SaaS, devoluciones y doble periodo histórico.
> Volver al [[backlog/README|índice del backlog]]. Semántica de estados: [[PAYMENT_STATUSES]].

## 1. Atomicidad y cascada del borrado de miembro (C9)

- [x] **`create()` de suscripción + pago NO es atómico pese a la regla "Atomic Invoicing".** — ✅ RESUELTO por [[FS-0002]] (compensación explícita, sin transacciones interactivas: Neon HTTP no soporta `db.transaction()`).
  - `subscriptions.service.create()` (gym) y los 4 sitios de `platform-subscriptions.service` (alta, pago adicional/renovación, cambio de plan vía alta, validación tardía) delegan al helper `compensateFailedEmission` (`apps/api-worker/src/lib/subscription-compensation.ts`): decisión por relectura (si el pago trae `receiptNumber` → `committed`, éxito), si no → pago anulado con motivo fijo `COMPENSATION_VOID_REASON` y huérfana cancelada con `cancel()`, nunca `delete()`. En SaaS el periodo extendido se revierte (`updatePeriodEnd(previousPeriodEnd)`) y un pago `voided` no puede re-validarse.
  - Consulta de detección (referencia histórica): `SELECT s.* FROM subscription s LEFT JOIN payment p ON p.subscription_id = s.id WHERE p.id IS NULL`.
- [ ] **El borrado de un miembro arrastra su histórico financiero por cascada.**
  - `payment.member_id` y `subscription.member_id` son `ON DELETE CASCADE`: borrar un miembro elimina sus pagos y suscripciones. Es hoy la única vía por la que un registro financiero desaparece (la suscripción ya no tiene DELETE) y es también de lo que depende la limpieza de E2E.
  - Coherente con "un registro financiero no se elimina": el miembro con pagos debería darse de **baja lógica** (desactivar) en vez de borrarse, o el borrado debería rechazarse (409) cuando tiene pagos. Requiere decidir la política del módulo Members y actualizar E2E (la limpieza pasaría al borrado de la organización).

## 2. Console — el borrado de la suscripción SaaS puede vaciar la serie `FS-N`

- [ ] **`DELETE /api/platform/subscriptions/:id` existe y borra la suscripción junto con sus pagos por cascada.**
  - Es la asimetría consciente respecto del Panel (donde C9 eliminó el DELETE de suscripciones): en Console la suscripción es de FitStack y el borrado se usa para deshacer altas equivocadas.
  - El problema: si esa suscripción ya tenía comprobantes `FS-N` emitidos, sus filas desaparecen del libro con sus números. La auditoría de `gaps[]` (que necesita el universo de números emitidos) las reportaría como **huecos** o, peor, el `last_number` de la secuencia quedaría por delante de las filas existentes.
  - Opciones: (a) rechazar el borrado cuando la suscripción tiene comprobantes numerados (409 + cancelar en su lugar), (b) borrado lógico (`cancelled_at` + un flag de "archivada"), (c) conservar las filas de pago huérfanas (FK sin cascada) para no perder el correlativo.
  - Mientras no se decida, el Panel y Console tienen reglas distintas para el mismo concepto y eso debe ser una elección explícita, no una sorpresa en una auditoría.

## 3. Pagos — devoluciones (`refunded`): reservado, no implementado

- [ ] **Implementar la devolución de un cobro.**
  - `PAYMENT_STATUSES.REFUNDED` existe en el enum y `QUALIFYING_PAYMENT_STATUSES` lo trata como pago que sostiene el periodo (`validated | refunded`), pero **ningún flujo lo produce**: no hay UI ni servicio que marque un pago como `refunded` (`updatePaymentStatus` ya escribe `refunded_at` si se le pide, pero nadie lo llama con ese estado desde producto).
  - Decidir la semántica completa antes de exponerlo: ¿revierte el periodo acumulado?, ¿emite nota de crédito o anula el comprobante?, ¿afecta el status SaaS?, ¿aplica también al Panel (`payment`) además de Console (`platform_subscription_payment`)?
  - Hoy `refunded` **no** toca el flag ANULADO y no cancela la suscripción.
  - **Disparador**: cuando se pida una devolución real o se conecte una pasarela de pago.

## 4. Suscripciones — auditoría del doble periodo histórico

> Fix front-load (alta `processing` no extiende hasta validar) implementado y verificado en [[FS-0003]]. Abajo solo queda la auditoría de históricos.

- [ ] **Revisar las suscripciones cuyo `current_period_end` excede `start_date + Σ duración de los pagos validated`.**
  - El bug de front-load pudo haber dejado `current_period_end` inflado en altas con pago `processing` que se validaron más tarde. La corrección (ver [[FS-0003]]) evita nuevos casos; **no auto-corregir** los históricos.
  - Detección (indicativa; normalizar la duración `day|week|month|year` por pago antes de sumar):

    ```sql
    -- periodos por delante del ciclo realmente pagado
    SELECT s.id, s.organization_id, s.start_date, s.current_period_end
    FROM platform_subscription s
    WHERE s.current_period_end > (
      s.start_date + <Σ duración normalizada de los pagos validated de s>
    );
    ```

  - Revisar manualmente cada exceso (puede ser un caso legítimo) antes de tocar datos; si procede, corregir con una migración de datos aprobada, nunca por inferencia automática.
  - **Disparador**: auditoría de facturación SaaS o reclamo de un gym.
