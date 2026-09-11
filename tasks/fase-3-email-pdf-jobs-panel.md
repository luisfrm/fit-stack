# Fase 3 — Email-notificación con PDF adjunto (jobs-worker) + UI panel del comprobante

> Depende de: Fase 2 (paso 1 número + paso 2 PDF en R2 vía consumer api-worker; **el email lo encola el paso 2** tras confirmar `receipt_pdf_key`). Dos tracks: **3A jobs-worker** y **3B panel**. Paralelizables entre sí.

## Objetivo

El HTML del email queda como notificación corta; el PDF adjunto es la fuente de verdad (decisión 1), leído desde R2 (nunca regenerado). En el panel, `receipt-dialog` v2 muestra el comprobante real (número correlativo, desglose fiscal, referencia enmascarada, disclaimer) con acciones imprimir / descargar / reenviar. Matar o implementar el `pdf-service.ts` fantasma.

## Contexto verificado

**Jobs-worker:**
- `apps/jobs-worker/src/index.ts` — `FitTaskEvent` con `email.payment_receipt { paymentId, organizationId }` (sin `receiptNumber`) y `email.org_payment_received`. Switch con `ack/retry`.
- `apps/jobs-worker/src/handlers/pdf.handler.ts` — `handlePaymentReceipt`: JOIN `payment + gym_member + organization`, formatea con `es-ES`, llama `renderPaymentReceipt` con **7 campos** y envía **solo HTML sin adjunto**. Nadie usa el soporte `attachments` de `sendEmail`.
- `apps/jobs-worker/src/handlers/email.handler.ts` — `sendEmail` **ya soporta** `attachments [{ filename, content: Buffer|Uint8Array }]` en Resend y Gmail SMTP. Falta `contentType` explícito (agregar).
- `apps/jobs-worker/src/templates/payment-receipt.ts` — `renderPaymentReceipt` con `headerSubtitle: 'Operación #${paymentId}'` (**UUID visible → eliminar**). Tema claro vía `layout.ts` (`renderLightShell`).
- `Env` de jobs-worker (`index.ts`): `DATABASE_URL, EMAIL_PROVIDER, RESEND_*, SMTP_*, PANEL_URL, CONSOLE_URL`. El binding R2 `FILES_BUCKET` **ya existe** en los 3 envs de `wrangler.jsonc` (dev/staging/production) — solo verificar que los tipos `PdfHandlerEnv`/`Env` lo declaren para leer el PDF.
- `@react-pdf/renderer` ^4.2.1 ya es dependencia de jobs-worker, pero **no se renderiza aquí**: el render vive en el consumer del paso 2 en `apps/api-worker` (co-ubicado con `composeReceiptData`). jobs-worker **solo lee el PDF ya subido a R2 y lo adjunta** — nada de duplicar lógica de generación en dos workers.
- El email de comprobantes numerados lo encola **el paso 2** (Fase 2) solo después de confirmar el `UPDATE receipt_pdf_key`: cuando `handlePaymentReceipt` corre para un pago numerado, el PDF **siempre** existe. La única rama sin adjunto es el histórico (`receipt_number IS NULL`), disparado por el reenvío manual (`POST :id/send-email`).

**Panel:**
- `apps/panel/components/payments/receipt-dialog.tsx` — modal cliente con `react-to-print`, alimentado por `ISubscription` plano (row de tabla). Muestra `REF: #paymentId` (**cambiar a `receiptNumber`**), miembro + plan + `documentId` (con `docLabel` por país — bien), fecha, método, tasa, total con bug potencial: divide `amountPaid/100` (asume centavos SaaS; el `payment` del gym es `numeric` decimal — verificar `subscriptions.repository` qué devuelve y no dividir dos veces). `paymentMethodDetails` vía `normalizePaymentDetails + PaymentDetailRow` **sin enmascarar**. Acciones: ENVIAR (vía `emailsService`) + imprimir.
- `apps/panel/components/payments/payment-detail-row.tsx` — `file` → link "VER CAPTURA" con URL R2 completa; `text/number` íntegros. Aquí se aplica `maskPaymentDetails` (los `file` siguen como link).
- `apps/panel/components/payments/subscriptions-table.tsx` — tabla con acción de comprobante (verificar nombre exacto de columna/acción en implementación).
- `apps/panel/lib/services/emails-service.ts` — `sendReceiptByEmail(paymentId)` → `POST /payments/:id/send-email`.
- `apps/panel/lib/services/pdf-service.ts` — **muerto**: llama a `GET /payments/:id/pdf` que no existe. Decisión binaria en esta fase: implementarlo contra `GET /:id/receipt` (Fase 2) o borrarlo + sus imports.
- `apps/panel/lib/api/client.ts` — `api` y `apiBlob` (para descarga binaria).
- Tipos: `ISubscription` en `apps/panel/types/dashboard.ts` (+ `IPayment` en shared) — extender con `receiptNumber, receiptIssuedAt, documentType, receiptVoided`.
- Regla toasts (AGENTS.md §7): `mutationError(scope, err, "<mensaje genérico>")` + `toast.error`, nunca texto crudo del API. Post-mutación: server action `updateTag` + `router.refresh()`.

## Crear

| Archivo | Contenido |
|---|---|
| `apps/jobs-worker/src/templates/payment-receipt-short.ts` (o reescritura de `payment-receipt.ts`) | `renderPaymentReceiptShort` — notificación corta: gym (`legalName\|\|name`), plan, monto, **número correlativo** (nunca `payment.id`), nota de adjunto. Mantener compat de firma para no romper otros callers. |
| `apps/panel/lib/services/receipts-service.ts` (nuevo) | `getReceipt(paymentId)` (JSON con los 3 estados del contrato), `downloadReceipt(paymentId, filename)` (vía `apiBlob` contra `GET /:id/receipt/pdf`, solo cuando `pdfStatus:'ready'`), `issueReceipt(paymentId)` (fallback manual), `sendReceiptEmail(paymentId)` (delegar o mover desde `emails-service`). |

## Modificar

**3A jobs-worker:**

| Archivo | Cambio |
|---|---|
| `apps/jobs-worker/src/index.ts` | `email.payment_receipt` pasa a `{ paymentId, organizationId, receiptNumber? }` (opcional = compat hacia atrás con eventos en vuelo). |
| `apps/jobs-worker/src/handlers/pdf.handler.ts` | `handlePaymentReceipt`: lee `payment` por `paymentId`; **si `receipt_pdf_key` existe** → descarga el PDF de R2 y adjunta `{ filename: '<numero>.pdf', content, contentType: 'application/pdf' }`; HTML corto con número humano. **Si `receipt_number IS NULL`** (histórico decisión 7) → envía sin adjunto + línea "documento anterior al sistema correlativo, solicítelo en el establecimiento". **Si `receipt_number` existe pero `receipt_pdf_key` es NULL** → no debería ocurrir (el evento se encola en el paso 2 tras completar el PDF): log + `ack` (no enviar email sin adjunto para numerados; el barrido de Fase 2 completará el PDF y el email se encolará entonces). Sin `member.email` → log + return (la emisión ya ocurrió en api-worker; el fallo es solo de envío). |
| `apps/jobs-worker/src/handlers/email.handler.ts` | `attachments` agrega `contentType?`; pasarlo a Resend (`contentType: 'application/pdf'`) y nodemailer (`contentType`). |
| `apps/jobs-worker/src/templates/payment-receipt.ts` | Eliminar `Operación #paymentId`; nueva firma corta con `receiptNumber`. |
| `apps/jobs-worker/wrangler.jsonc` + `Env`/`PdfHandlerEnv` | El binding R2 `FILES_BUCKET` **ya está** en los 3 envs; solo declarar/extender los tipos en `Env` (`index.ts`) y `PdfHandlerEnv` si faltan. (El cron del barrido y su producer `RECEIPT_QUEUE` son Fase 2.) |

**3B panel:**

| Archivo | Cambio |
|---|---|
| `apps/panel/components/payments/receipt-dialog.tsx` | v2 alimentada por `GET /:id/receipt` (no por el row plano), manejando los 3 estados del contrato: **ready** (`200 available:true pdfStatus:'ready'`) → encabezado gym (`legalName\|\|name`, `taxId` con `taxLabel`, `address`, logo), número correlativo + badge ANULADO si `receiptVoided`; **pending** (`202 pdfStatus:'pending'`) → estado "PDF en preparación" (sin descarga, botón re-consultar); **pre_system** (`200 available:false reason:'pre_system'`) → estado "anterior al sistema correlativo" (sin número, sin descarga, sin error). Cuerpo ready: miembro (`documentId` con `docLabel`), venta (snapshot + periodo), desglose (`subtotal`, líneas `taxDetails`, `taxTotal`, `amountPaid+currencyPaid`, tasa si aplica), referencia **enmascarada**, `paymentDate` vs emisión, disclaimer país + "Generado con FitStack`. Acciones: Imprimir (`react-to-print`, se mantiene), Descargar PDF (`receipts-service.downloadReceipt` → `GET /:id/receipt/pdf` vía `apiBlob`), Enviar → `POST send-email` (ready: email; pending: re-encola render y toast "se enviará al generarse"; pre_system: email sin adjunto) con `mutationError('recibo', …)` + toast + `updateTag` + `refresh()`. |
| `apps/panel/components/payments/payment-detail-row.tsx` | Aplicar `maskPaymentDetails` de shared (Fase 0). `file` sigue como link "VER CAPTURA". |
| `apps/panel/components/payments/subscriptions-table.tsx` | Acción "Comprobante": visible solo con pagos `validated`; label "Emitir" vs "Reimprimir" según exista `receiptNumber`; badge ANULADO. Ocultar acciones sin permiso (autorización real = servidor). |
| `apps/panel/lib/services/pdf-service.ts` | Implementar contra `GET /:id/receipt` **o** borrar + limpiar imports. Sin tercera opción. |
| `apps/panel/types/dashboard.ts` (+ shared `IPayment`) | Agregar `receiptNumber?, receiptIssuedAt?, documentType?, receiptVoided?` a `ISubscription`/joins. Verificar la consulta de `subscriptions.repository.findAllPaginated` devuelve los nuevos campos (agregar al select si falta). |

## Criterios de aceptación

- Email recibido: asunto/número humano sin UUID, cuerpo corto, PDF adjunto **idéntico byte-a-byte** al descargado en panel.
- **El email de un comprobante numerado nunca se envía antes de que exista el PDF**: el evento se encola desde el paso 2; con `receipt_pdf_key IS NULL` jobs-worker loguea y hace `ack` sin enviar (caso defensivo, no de flujo normal).
- Miembro sin email → emisión OK en api-worker; `send-email` → 422 con mensaje de mostrador; dialog muestra toast y ofrece imprimir.
- Histórico (`receipt_number IS NULL`) → email sin adjunto, sin error; dialog muestra el estado `pre_system` ("anterior al sistema", sin número, sin descarga).
- Panel maneja los 3 estados del contrato sin caer en error: ready (número + descarga + envío), pending (202, "PDF en preparación", re-consultar/reenviar), pre_system (200 `available:false`).
- Referencia larga aparece enmascarada en UI, impresión y email; `file` sigue como link.
- E2E panel (extender `e2e/panel/subscriptions.spec.ts` o nuevo `receipts.spec.ts` con fixture pago validado): abrir comprobante → ver número con formato + disclaimer VE → descargar → reenviar → toast éxito. `pnpm test:e2e:panel` verde.
- `pnpm typecheck`, `lint`, `test` verdes.

## Verificación

```bash
pnpm --filter panel test
pnpm test:e2e:panel
pnpm typecheck
```