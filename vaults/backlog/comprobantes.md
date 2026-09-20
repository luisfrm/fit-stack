# Backlog — Comprobantes

> Correlativo, barrido, auditoría de `gaps[]`, PDF ANULADO y DLQ del email.
> Volver al [[backlog/README|índice del backlog]]. Modelo: [[ORGANIZATION_RECEIPT_MODEL]] · Estados: [[PAYMENT_STATUSES]] · Task cerrada: [[FS-0001]].

## 1. ANULADOS anteriores a B2 — checklist post-deploy

> Migración `0018` (`receipt_voided_pdf_key` + índices parciales) aplicada en [[FS-0001]]. Abajo solo queda el checklist operativo post-deploy.

- [ ] **Conteo previo al deploy** (saber a cuántos afecta):

  ```sql
  SELECT count(*) FROM payment
   WHERE receipt_voided AND receipt_voided_pdf_key IS NULL;
  SELECT count(*) FROM platform_subscription_payment
   WHERE receipt_voided AND receipt_voided_pdf_key IS NULL;
  ```

- [ ] **Recuperación**: los recoge el **tercer predicado del barrido** (`voided_at < now() - 15 min`). Con el cron de pre-venta (`0 */10 * * *`) pueden tardar hasta 10 h; para no esperar, forzar un barrido manual (`pnpm --filter jobs-worker ...` o invocar el `scheduled` equivalente) tras el deploy.
- [ ] **Validar** que los anulados de [[PAYMENT_STATUSES]] §5 vuelven a descargar (200) y que la descarga trae el sello ANULADO.
- [ ] **Pagos validados sin número** (secuela de B1, previos al fix): listarlos y emitir con `POST /api/payments/:id/issue`:

  ```sql
  SELECT id, member_id, amount_paid, payment_date FROM payment
   WHERE status = 'validated' AND receipt_number IS NULL ORDER BY payment_date;
  ```

  En el reporte de comprobantes aparecen con la etiqueta **"Sin comprobante"** (estado `pre_system`), que es la que ve el operador.

- [ ] **UI (mejora diferida)**: mientras el sello se genera, el diálogo del comprobante dice "PDF en preparación" sin distinguir que está anulado (el 202 no lleva el flag). Añadir `receiptVoided` al estado `pending` si el producto lo pide.
- [ ] **Sello ANULADO**: hoy es un texto rojo en la cabecera (`receipt-pdf.tsx`); si se quiere marca de agua diagonal, es un cambio visual independiente.

## 2. Cadencia del barrido en pre-venta

- [ ] **Barrido de comprobantes (`jobs-worker.scheduled()`): cron cada 10 h → 10 min al vender con clientes reales.**
  - Hoy (pre-venta) el cron en `infrastructure/terraform/workers.tf` (`cloudflare_workers_cron_trigger.jobs_sweep`) es `0 */10 * * *` para no generar ~144 invocaciones/día por ambiente sin uso real.
  - El barrido repara el hueco "número asignado pero evento nunca encolado" (publicación fallida a `fit-receipt-events` o consumer caído); con 10 h el peor caso de recuperación es ≤ ~10 h (cron) + 15 min (umbral de `receipt_issued_at`).
  - Al pasar a clientes reales, volver a `*/10 * * * *` (recuperación ≤ 25 min). Cambio en Terraform + actualizar este ítem y los docs que citan la cadencia ([[terraform]]).
  - El flujo normal NO depende del barrido: el render se dispara al instante por el `send` del paso 1.

## 3. Console — universo completo de la serie en la auditoría (C4)

- [ ] **Cuando la serie global `FS-N` crezca (miles de comprobantes), acotar la lectura del universo de `gaps[]`.**
  - La auditoría necesita el universo **completo** de números (cualquier ausente es un hueco), así que hoy `getPlatformReceiptSequenceState` lee todas las filas numeradas de `platform_subscription_payment` (solo 5 columnas, sin paginar). Es correcto y trivial hoy; no lo será con decenas de miles de filas.
  - **Disparador**: si el reporte de Console tarda visiblemente → acotar por rango (`seq >= lastNumber - N`) o particionar la serie por año de emisión, manteniendo la semántica de hueco.
  - Lo mismo aplica al Panel si una organización acumula muchos años en una sola serie.

## 4. Comprobantes previos al snapshot del emisor (C1)

> Snapshot del emisor implementado en [[FS-0001]] (migración `0016`, `emitter_snapshot` + `issued_by` persistidos junto al número, compose lee snapshot primero). Los pagos con `emitter_snapshot = NULL` (pre-C1) se recomponen en vivo — estado terminal documentado, no es un bug: el PDF en R2 es inmutable; sin backfill inventado.

## 5. Email perdido en la DLQ después de la marca de notificado (C6)

- [ ] **El barrido de C6 no cubre el email que ya se encoló y agotó reintentos.**
  - El paso 2 marca `receipt_notified_at` **antes** de encolar `email.payment_receipt` / `email.org_payment_received`, y solo la revierte si el `send()` a la cola falla. Si el mensaje ya encolado falla N veces en el handler de email y cae a la DLQ de `fit-task-events`, la marca queda puesta y el 2.º predicado del barrido (`receipt_notified_at IS NULL`) no lo ve.
  - Recuperación hoy: **manual** — `POST /api/payments/:id/send-email` (Panel) o `POST /api/platform/subscriptions/payments/:id/resend` (Console).
  - Opciones si se quiere automático: (a) que el handler de email limpie la marca al fallar de forma definitiva (requiere que conozca el `paymentId`/scope, hoy no lo hace), o (b) un barrido de la DLQ, que Cloudflare no expone como cola consultable (habría que persistir el fallo en DB).
  - **Disparador**: si aparece un comprobante con `receipt_pdf_key` y sin email entregado en una auditoría real.

## 6. Naming cosmético `platform_document_sequence.next_number` (C7)

- [ ] **Renombrar `next_number` a `last_number` para alinear con `organization_document_sequence.last_number`.**
  - `platform_document_sequence.next_number` guarda el **ÚLTIMO** número entregado, no el siguiente (ver `packages/database/src/repositories/platform-receipts.repository.ts`). El nombre induce a error, pero el comportamiento es el correcto.
  - Puramente cosmético y **sí** requiere migración → no vale un ciclo propio: agrupar con la próxima migración que se genere por otro motivo.
  - El contrato del repositorio ya expone `getPlatformReceiptSequenceState(...).lastNumber`, así que todos los consumidores hablan en términos de "último"; solo el nombre de la columna queda desalineado.

## 7. `claim-then-number`, cierre total de la carrera de correlativo (D4 / C0)

- [ ] **Riesgo residual de la carrera de doble emisión: si el perdedor no es el último consumidor, su número queda irreclaimable sin renumerar (prohibido).**
  - Contexto: C0 dejó documentado este riesgo. La compensación (`releaseLastPlatformNumber`) solo revierte cuando el perdedor sigue siendo el último consumidor; si otro pago consumió la secuencia después, el número perdido queda como hueco auditado. La guarda tardía reduce la ventana a milisegundos, pero no la cierra.
  - **Disparador explícito**: si el reporte de huecos (`gaps[]`) muestra un hueco **no explicado** en producción.
  - Esbozo de la solución completa (claim-then-number): reclamar el pago con `UPDATE … WHERE receipt_number IS NULL RETURNING id` (persistiendo ya los impuestos) **antes** de consumir la secuencia y asignar el número después. Obligaría a una rama extra de reparación en el barrido para el estado intermedio "reclamado sin número".
  - Estado: NO implementado; decisión D4 congelada (ver `correcciones-comprobantes.md`).
