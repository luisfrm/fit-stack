# Fase 2 — Emisión Panel en dos pasos (número síncrono + PDF en cola)

> Depende de: Fase 0 (gate, tax-math, formatos, `ReceiptData`, checklist) y Fase 1 (secuencia + columnas). Aquí nace el comprobante real.

> **⚠️ Addendum de arquitectura (decisión final, reemplaza lo que diga abajo sobre ubicación):**
> El **consumer de `fit-receipt-events` vive en `apps/jobs-worker`**, NO en api-worker. `api-worker` es solo **productor** (paso 1 + `POST /:id/issue` + re-encolados); **no** agrega `@react-pdf/renderer` ni `queue()` para esta cola.
> - **Acceso a datos de comprobantes compartido** en `packages/database/src/repositories/receipts.repository.ts` (excepción consciente AGENTS.md §1): `nextDocumentNumber`, `attachReceipt`, `markVoided`, `findByReceiptNumber`, `getReceiptComposedData`, **`completeReceiptPdf`** (gate del PDF: `UPDATE … WHERE receipt_pdf_key IS NULL RETURNING`) y **`markReceiptNotified`** (gate del email, con `clearReceiptNotified` de rollback: un fallo transitorio de la cola NUNCA pierde el correo).
> - **Render** en `apps/jobs-worker/src/receipt-pdf.tsx` (usa el `@react-pdf/renderer` que ya está en ese worker, import lazy). Handler `handleReceiptRender` en `apps/jobs-worker/src/handlers/receipt.handler.ts`; `queue()` ramifica por `batch.queue`.
> - **Puros en shared**: `receipt-events.ts` (evento `receipt.render` + `scope`), `receipt-storage-keys.ts` (`panelReceiptKey`), `receipt-compose.ts` (`buildReceiptDataFromComposed`).
> - El email del comprobante numerado lo encola el paso 2 **solo si `markReceiptNotified` devuelve `completed===true`** (marcador propio `receipt_notified_at`, no `receipt_pdf_key`). El barrido `sweepPendingReceiptPdfs` es query local de jobs-worker.

## Objetivo

Emisión en **dos pasos separados** (sin transacciones interactivas en serverless, sin "rollback" de números) sobre una **cola dedicada** para el render:

- **Cola nueva `fit-receipt-events`** (binding `RECEIPT_QUEUE` + DLQ `fit-receipt-events-dlq`): productor en `apps/api-worker`, **consumer en `apps/jobs-worker`** (handler `queue()` ramificado por `batch.queue`; segunda entrada en `queues.consumers`). **No reutiliza `TASK_QUEUE`/`fit-task-events`**: esa cola ya tiene como consumer a `jobs-worker` y una cola admite un solo consumer.
- **Paso 1 — síncrono en el request que valida el pago**: asigna el número correlativo (una sentencia atómica, rápido, sin I/O externo) + `UPDATE payment SET receipt_number, receipt_issued_at … WHERE receipt_number IS NULL` y **encola `receipt.render`** en `RECEIPT_QUEUE`. Emisión **automática** al pasar el pago a `validated` (decisión 3). Reimprimir/reenviar = READ. Emitir no exige email (decisión 8, mostrador).
- **Paso 2 — consumer de `fit-receipt-events` en jobs-worker**: `getReceiptComposedData` (repo compartido) → `buildReceiptDataFromComposed` (shared) → `checklistPrePdf` → render PDF → `PUT` R2 en key determinista (overwrite idempotente) → `completeReceiptPdf`. La **notificación** usa su propio gate `markReceiptNotified` (`receipt_notified_at`): el ganador encola `email.payment_receipt`; si el `send` falla, `clearReceiptNotified` + relanza para que la cola reintente (nunca se pierde el correo, nunca se duplica). El número del evento se ignora a favor del **persistido** (`composed.payment.receiptNumber`). El estado intermedio `receipt_number NOT NULL AND receipt_pdf_key IS NULL` = "numerado, PDF pendiente": válido, reintentable con el mismo número (misma key). **Nunca se libera ni reusa un número.**
- **Barrido periódico (cierra el hueco "número asignado pero evento nunca encolado")**: cron en `apps/jobs-worker` (Terraform: `cloudflare_workers_cron_trigger`, **pre-venta cada 10 h**; bajar a 10 min con clientes reales — ver `docs/PENDING.md`) que busca `receipt_number IS NOT NULL AND receipt_pdf_key IS NULL AND receipt_issued_at < now() - interval '15 minutes'` (tope por corrida, ej. 50 filas) y **re-encola `receipt.render`** con su producer binding `RECEIPT_QUEUE`. Cubre fallos de publicación a la cola y consumers que agotan reintentos (sin depender de una DLQ visible). La re-entrega es inofensiva por la idempotencia del paso 2.
- `POST /:id/issue` manual responde de inmediato `{ receiptNumber, pdfStatus: "pending" }` sin bloquear esperando el PDF.

## Contexto verificado

- `apps/api-worker/src/services/subscriptions.service.ts` — `create()` y `updatePaymentStatus()`: al quedar `validated` ejecutan **paso 1** (`assignReceiptNumber`, encola `receipt.render`); ya **no** encolan `email.payment_receipt` directo (el email lo encola el paso 2 en jobs-worker tras `completeReceiptPdf`). `voided/invalid` → cancela subscription; `voided` con número → `markReceiptVoided`.
- `apps/api-worker/src/routes/payments.route.ts` — `PATCH /:id/status` (permiso `SUBSCRIPTIONS.UPDATE`, invalida caches `subscriptions*`, `payments:analytics`, `members:stats`, `dashboard:*`, `reports:revenue*`); `POST /:id/send-email` (permiso `SUBSCRIPTIONS.READ`, sin validaciones). No existe `GET /:id/receipt` ni `POST /:id/issue` ni `GET /:id/receipt/pdf`. Contrato final del recurso (evita 409 en el caso histórico, que es terminal, no un conflicto resoluble): `GET /:id/receipt` responde `200 { available: true, receiptNumber, pdfStatus: 'ready', receipt, pdfUrl }` si hay PDF · `202 { available: true, receiptNumber, pdfStatus: 'pending' }` si está numerado sin PDF (transitorio, el cliente puede reintentar) · `200 { available: false, reason: 'pre_system' }` si `receipt_number IS NULL` (histórico: nunca existirá PDF). La descarga binaria vive aparte: `GET /:id/receipt/pdf` (auth + READ) → 200 bytes `application/pdf` vía `getFile`, o 404 si no hay objeto.
- `apps/api-worker/src/routes/subscriptions.route.ts` — `POST /` (`SUBSCRIPTIONS.CREATE` + `requireOrgTimezone()` + `createSubSchema`), helper `invalidateSubscriptionDependentCaches` ya invalida todo lo dependiente.
- `apps/api-worker/src/lib/r2.ts` — `createR2Service` solo tiene `getUploadUrl/listFiles/deleteFile`. **No tiene `put`/`get`**: hay que agregar `putFile(key, bytes, contentType)` + `getFile(key)` usando el binding `FILES_BUCKET` (ya existe en `Env`, `lib/env.ts`).
- `apps/api-worker/src/lib/storage-keys.ts` — `constructStorageKey` mete sufijo aleatorio → **no sirve** para PDFs deterministas. Hace falta builder nuevo (no modificar el existente, que usan las capturas).
- `apps/api-worker/src/lib/route-handler.ts` — middlewares `requireOrgPermission`, `requireOrgTimezone` (año y fechas en tz del gym, nunca UTC del servidor).
- Motor PDF: `@react-pdf/renderer` **ya está** en `apps/jobs-worker/package.json` (^4.2.1) y en legacy `apps/api` (solo referencia visual). El render vive en **jobs-worker** (consumer del paso 2); **no** se agrega a api-worker. Base visual legacy a adaptar (número correlativo, disclaimer país, centavos → `formatCents`, tasa, enmascarado, UUID ausente).
- `apps/api-worker/src/index.ts` — no cambiar el export de Hono; **sin `queue()` ni consumers** (api-worker es solo producer). La cola `fit-receipt-events` se cablea en `wrangler.jsonc` (`queues.producers`) y Terraform. El consumer vive en `apps/jobs-worker` (ver addendum).
- `apps/jobs-worker` — `wrangler.jsonc` sin `triggers` hoy. El barrido requiere `triggers.crons` + `scheduled()` en `index.ts` + producer binding `RECEIPT_QUEUE`. Su rol de email (`queue()` sobre `fit-task-events`) no cambia; el binding R2 `FILES_BUCKET` **ya existe** en los 3 envs de su `wrangler.jsonc` (solo verificar tipos `PdfHandlerEnv`).

## Crear

| Archivo | Contenido |
|---|---|
| `packages/database/src/repositories/receipts.repository.ts` | Compartido (excepción AGENTS.md §1): `nextDocumentNumber`, `attachReceipt`, `markVoided`, `findByReceiptNumber`, `getReceiptComposedData`, `completeReceiptPdf`, `markReceiptNotified`, `clearReceiptNotified`. |
| `apps/api-worker/src/services/receipts.service.ts` (factory `createReceiptsService(db, receiptQueue)`) | **Paso 1 `assignReceiptNumber({ orgId, paymentId, timezone, orgSlug, taxOverride? })` (síncrono, sin I/O externo)**: 1) valida `status === 'validated'` (409 `NOT_VALIDATED` si no); 2) idempotencia: si ya tiene `receipt_number`, devuelve el existente sin quemar secuencia; 3) año local en tz del gym (`toLocalDayString`), `nextDocumentNumber`, `formatPanelReceiptNumber` + coherencia `parse`; 4) impuestos Fase 0 en centavos persistidos vía `attachReceipt` (`WHERE receipt_number IS NULL`); 5) `RECEIPT_QUEUE.send(buildReceiptRenderEvent(...))`; responde `{ receiptNumber, pdfStatus: "pending" }`. **El email NO se encola aquí.** + `getReceiptState` (contrato 3 estados, compone con `getReceiptComposedData` + `buildReceiptDataFromComposed`) + `markReceiptVoided` (sin número → 409 `RECEIPT_NOT_ISSUED`; ya anulado → idempotente sin pisar auditoría). **Sin render ni `@react-pdf/renderer`.** El paso 2 vive en jobs-worker (ver addendum). |
| `apps/jobs-worker/src/receipt-pdf.tsx` (nuevo) | Render PDF consumiendo `ReceiptData` con `@react-pdf/renderer` (ya dependencia de este worker; usado solo por el consumer del paso 2, import lazy). Base visual: legacy `apps/api/services/pdf/receipt-pdf.tsx` (número correlativo, disclaimer país, montos en centavos → `formatCents`, tasa visible, referencia enmascarada, UUID ausente). Un solo renderizador: este output es el adjunto del email (Fase 3) y la descarga del panel. **No agregar `@react-pdf/renderer` a api-worker.** |
| `packages/shared/src/documents/receipt-storage-keys.ts` (nuevo, puro) | `panelReceiptKey(orgSlug, year, receiptNumber)` → `receipts/<slug>/<year>/<numero>.pdf` (determinista, sin sufijo aleatorio; naming unificado con Console, sin prefijo `cms/`). Vive en shared porque api-worker (evento/estado) y jobs-worker (PUT R2) deben derivar la MISMA key. |
| `apps/api-worker/src/routes/receipts.route.ts` (o extender `payments.route.ts` — decidir en implementación; preferencia: extender `payments.route.ts` para no tocar `index.ts`) | `GET /api/payments/:id/receipt` (permiso `SUBSCRIPTIONS.READ` — cashier incluido): `200 { available: true, receiptNumber, pdfStatus: 'ready', receipt, pdfUrl }` · `202 { available: true, receiptNumber, pdfStatus: 'pending' }` · `200 { available: false, reason: 'pre_system' }` (histórico, terminal — nunca PDF; **sin 409**). `GET /api/payments/:id/receipt/pdf` (READ): 200 bytes `application/pdf` vía `r2.getFile`, 404 si no hay objeto. `POST /api/payments/:id/issue` (fallback manual, `SUBSCRIPTIONS.UPDATE` — owner/manager): ejecuta paso 1, responde `{ receiptNumber, pdfStatus: "pending" }`. `POST /:id/send-email` (READ): sin email del miembro → 422; histórico → encola email (sin adjunto); numerado con PDF listo → encola email; numerado sin PDF → re-encola `receipt.render` (idempotente) y responde `202 { pdfStatus: 'pending' }` (el paso 2 encola el email al completar). |
| Consumer `handleReceiptRender` en `apps/jobs-worker/src/handlers/receipt.handler.ts` + `queue()` ramificado por `batch.queue` | Consumer de `fit-receipt-events` (binding `RECEIPT_QUEUE`, DLQ `fit-receipt-events-dlq`, `max_retries` 3): `handleReceiptRender(event)` → ack; error → retry nativo de la cola. |
| Barrido de pendientes en `apps/jobs-worker/src/handlers/receipt.handler.ts` (`sweepPendingReceiptPdfs`) + `scheduled()` en `index.ts` | Query **local** de jobs-worker (`@neondatabase/serverless`): `SELECT id, organization_id, receipt_number FROM payment WHERE receipt_number IS NOT NULL AND receipt_pdf_key IS NULL AND receipt_issued_at < now() - interval '15 minutes' LIMIT 50` y `RECEIPT_QUEUE.send(buildReceiptRenderEvent(...))` por fila. Cron pre-venta cada 10 h (ver `docs/PENDING.md`). Idempotente con el paso 2. `findPendingPdf` NO va al repo compartido (solo jobs-worker lo usa; criterio 2-apps-idéntico). |

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/lib/r2.ts` | Agregar `putFile(key, body, contentType)` + `getFile(key)` con `FILES_BUCKET`. |
| `apps/api-worker/src/services/subscriptions.service.ts` | `create()` con `validated` y `updatePaymentStatus()` → `validated`: ejecutar **paso 1** (`assignReceiptNumber`) — este encola el render; **el email lo encola el paso 2 al completar el PDF** (Fase 3). `updatePaymentStatus()` → `voided`: si el pago ya tenía número → `markVoided` (conserva número + PDF, setea `receipt_voided`, `voided_by/at/reason`), además del `cancel()` de subscription que ya hace. Extender firma del servicio para recibir `queue`/`r2` + `orgSlug/timezone` donde haga falta. |
| `apps/api-worker/src/routes/payments.route.ts` | `PATCH /:id/status` (sin cambios de lógica) y `POST /:id/send-email` con la semántica de arriba + validación de email (422). Nuevos endpoints `GET /:id/receipt`, `GET /:id/receipt/pdf`, `POST /:id/issue`. Misma invalidación de caches existente. |
| `apps/api-worker/src/index.ts` + `wrangler.jsonc` | Solo `queues.producers` (`RECEIPT_QUEUE`) en los 3 envs. **Sin `queue()` y sin consumers** (el consumer vive en jobs-worker). |
| `apps/jobs-worker/src/index.ts` + `wrangler.jsonc` | `queue()` ramificado por `batch.queue` + `scheduled()` (barrido) + producers `RECEIPT_QUEUE` y `TASK_QUEUE` en los 3 envs. **Consumer y cron viven en Terraform** (dueño único), no en wrangler. |
| `infrastructure/terraform/queues.tf` + `workers.tf` + `main.tf` (+ `variables.tf`/`outputs.tf`) | Cola `fit-receipt-events{env}` + DLQ `fit-receipt-events-dlq{env}`; en `api_worker`: solo producer `RECEIPT_QUEUE`; en `jobs_worker`: producer `RECEIPT_QUEUE` + `TASK_QUEUE`, resources `cloudflare_queue_consumer` (receipts + task, cada uno con su DLQ) + `cloudflare_workers_cron_trigger` (**pre-venta `0 */10 * * *`**). Regla AGENTS.md: infra por Terraform + GitHub Actions, **nunca `wrangler` manual**. |
| `apps/api-worker/package.json` (+ lock) | Agregar `@react-pdf/renderer` (alinear versión con jobs-worker ^4.2.1 o legacy ^4.5.1 — verificar compat con Workers antes; riesgo de bundle, mitigar con import dinámico/lazy si hace falta). |

## No tocar

jobs-worker: solo el cron del barrido en esta fase (los cambios de email/adjunto son Fase 3); panel (Fase 3-4); `platform_subscription_payment` (C2); `constructStorageKey` existente.

## Constraints heredados del review de Fase 1 (obligatorios aquí)

- **Doble numeración silenciosa**: si `attachReceipt` recibe un número distinto para un pago ya numerado, hoy lo ignora en silencio (quema un número de secuencia sin señal). El servicio (paso 1) debe detectar `existing.receiptNumber !== input` y responder **409 `{ code: 'ALREADY_NUMBERED' }`** (o equivalente documentado). Cubrir con test.
- **`markVoided` sin número / re-anulación**: hoy acepta pagos con `receipt_number IS NULL` y pisa la auditoría al re-anular. El servicio debe: pago sin número → **409 `{ code: 'RECEIPT_NOT_ISSUED' }`** (o anular sin flags de comprobante — definir); pago ya anulado → idempotente sin pisar `voided_by/at/reason` **o** 409 `ALREADY_VOIDED` (definir). Cubrir con tests.
- **Coherencia número↔secuencia**: el servicio debe garantizar `parsePanelReceiptNumber(n).year === añoReservado` y `slug === org.slug` (vía `formatPanelReceiptNumber`, nunca string manual) antes de `attachReceipt`. El reporte de huecos (Fase 5) asume esta coherencia.
- **Mapeo de errores a códigos**: los `Error` genéricos del repo se mapean en ruta/servicio a `{ error, code }`: formato/año inválido → 400, pago de otra org → 404, duplicado/ya-anulado → 409. Nunca texto crudo al cliente (regla toasts).
- **Índice pending sin org**: `idx_payment_receipt_pending` es global `(receipt_issued_at)`; si el barrido filtra por org, medir y, si hace falta, migrar a `(organization_id, receipt_issued_at)` en esta fase.
- **Índice `org+issued_at` con NULLs legacy**: si el reporte/caché lo justifica, parcializarlo con `WHERE receipt_number IS NOT NULL` (Fase 5 lo necesita; adelantar aquí solo si hace falta).

## Criterios de aceptación

- **Paso 1**: crear sub con pago `validated` → `receipt_number` con formato de inmediato (`pdfStatus: "pending"`) + mensaje `receipt.render` en `fit-receipt-events` + impuestos persistidos (`subtotal/tax_total/tax_details`).
- **Paso 2**: el consumer completa `receipt_pdf_key` en R2 y encola `email.payment_receipt` (spy de R2/Queue).
- **Entrega duplicada del mismo mensaje** (at-least-once): la segunda ejecución no genera segundo PDF efectivo ni segundo evento de email (`UPDATE … WHERE receipt_pdf_key IS NULL` afecta 0 filas → sin email). Criterio explícito, no implícito.
- **Barrido**: fila con número y sin PDF y `receipt_issued_at` viejo → el `scheduled()` re-encola y el consumer la completa; una fila reciente **no** se re-encola.
- **Contrato**: `GET /:id/receipt` → 200 ready / 202 pending / 200 `available:false, reason:'pre_system'` (nunca 409); `GET /:id/receipt/pdf` → 200 bytes o 404.
- Pago `processing` → `POST /:id/issue` responde 409; `voided` con número → conserva número y marca ANULADO + cancela subscription (comportamiento existente preservado).
- Funciona sin email en el miembro (emitir no exige email).
- `pnpm typecheck`, `lint`, `test:integration` verdes.

## Verificación

```bash
pnpm --filter api-worker test:integration
pnpm typecheck
pnpm lint
```

## Riesgos

- Render en jobs-worker (donde `@react-pdf/renderer` ya vive) con import lazy; `api-worker` NO agrega la dependencia. Alternativa si pesara demasiado: PDF minimalista propio — nunca mover el render al request HTTP.
- Sin transacciones interactivas: el diseño ya no las necesita (sentencia única + UPDATE condicional + key R2 idempotente).
- **Hueco publicación↔fila**: el paso 1 actualiza la fila y luego publica a la cola; si la publicación falla, el barrido lo repara (pre-venta: ≤ ~10 h + 15 min; con 10 min: ≤ 25 min). El barrido re-encola aunque el consumer esté a mitad de trabajo: la idempotencia del paso 2 absorbe duplicados.
- **Una cola, UN consumer**: `fit-receipt-events` la consume solo jobs-worker; jobs-worker consume DOS colas distintas (`fit-task-events` + `fit-receipt-events`), cada una con su DLQ. Nunca dos consumers sobre la misma cola.