# Fase 3 — Email-notificación con PDF adjunto (jobs-worker) + UI panel del comprobante

> Depende de: Fase 2 (PDF inmutable en R2 + evento con `receiptNumber`). Dos tracks en esta task: **3A jobs-worker** y **3B panel**. Pueden ejecutarse en paralelo entre sí.

## Objetivo

El HTML del email queda como notificación corta; el PDF adjunto es la fuente de verdad (decisión 1), leído desde R2 (nunca regenerado). En el panel, `receipt-dialog` v2 muestra el comprobante real (número correlativo, desglose fiscal, referencia enmascarada, disclaimer) con acciones imprimir / descargar / reenviar. Matar o implementar el `pdf-service.ts` fantasma.

## Contexto verificado

**Jobs-worker:**
- `apps/jobs-worker/src/index.ts` — `FitTaskEvent` con `email.payment_receipt { paymentId, organizationId }` (sin `receiptNumber`) y `email.org_payment_received`. Switch con `ack/retry`.
- `apps/jobs-worker/src/handlers/pdf.handler.ts` — `handlePaymentReceipt`: JOIN `payment + gym_member + organization`, formatea con `es-ES`, llama `renderPaymentReceipt` con **7 campos** y envía **solo HTML sin adjunto**. Nadie usa el soporte `attachments` de `sendEmail`.
- `apps/jobs-worker/src/handlers/email.handler.ts` — `sendEmail` **ya soporta** `attachments [{ filename, content: Buffer|Uint8Array }]` en Resend y Gmail SMTP. Falta `contentType` explícito (agregar).
- `apps/jobs-worker/src/templates/payment-receipt.ts` — `renderPaymentReceipt` con `headerSubtitle: 'Operación #${paymentId}'` (**UUID visible → eliminar**). Tema claro vía `layout.ts` (`renderLightShell`).
- `Env` de jobs-worker (`index.ts`): `DATABASE_URL, EMAIL_PROVIDER, RESEND_*, SMTP_*, PANEL_URL, CONSOLE_URL`. **No tiene R2** → para leer el PDF hace falta binding `FILES_BUCKET` (y tipos en `PdfHandlerEnv`) o URL firmada servida por api-worker. Decisión recomendada: agregar binding R2 al worker de jobs (misma cuenta/bucket).
- `@react-pdf/renderer` ^4.2.1 ya es dependencia de jobs-worker (no se necesita para esta fase si el PDF viene de R2 — no renderizar aquí).

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
| `apps/panel/lib/services/receipts-service.ts` (nuevo) | `getReceipt(paymentId)` (JSON del comprobante), `downloadReceipt(paymentId, filename)` (vía `apiBlob` contra `GET /:id/receipt`), `issueReceipt(paymentId)` (fallback manual), `sendReceiptEmail(paymentId)` (delegar o mover desde `emails-service`). |

## Modificar

**3A jobs-worker:**

| Archivo | Cambio |
|---|---|
| `apps/jobs-worker/src/index.ts` | `email.payment_receipt` pasa a `{ paymentId, organizationId, receiptNumber? }` (opcional = compat hacia atrás con eventos en vuelo). |
| `apps/jobs-worker/src/handlers/pdf.handler.ts` | `handlePaymentReceipt`: resuelve `receipt_pdf_key` (del evento o por query a `payment` por `paymentId`); lee PDF **desde R2** (binding nuevo); compone HTML corto con número humano; adjunta `{ filename: '<numero>.pdf', content, contentType: 'application/pdf' }`. Si `receipt_pdf_key` es `NULL` (histórico decisión 7) → envía sin adjunto + línea "documento anterior al sistema correlativo, solicítelo en el establecimiento". Sin `member.email` → log + return (la emisión ya ocurrió en api-worker; el fallo es solo de envío). |
| `apps/jobs-worker/src/handlers/email.handler.ts` | `attachments` agrega `contentType?`; pasarlo a Resend (`contentType: 'application/pdf'`) y nodemailer (`contentType`). |
| `apps/jobs-worker/src/templates/payment-receipt.ts` | Eliminar `Operación #paymentId`; nueva firma corta con `receiptNumber`. |
| `apps/jobs-worker/wrangler.*` + `Env`/`PdfHandlerEnv` | Agregar binding R2 `FILES_BUCKET` (mismo bucket que api-worker) + var de entorno si hace falta. |

**3B panel:**

| Archivo | Cambio |
|---|---|
| `apps/panel/components/payments/receipt-dialog.tsx` | v2 alimentada por `GET /:id/receipt` (no por el row plano): encabezado gym (`legalName\|\|name`, `taxId` con `taxLabel`, `address`, logo), número correlativo + badge ANULADO si `receiptVoided`, miembro (`documentId` con `docLabel`), venta (snapshot + periodo), desglose (`subtotal`, líneas `taxDetails`, `taxTotal`, `amountPaid+currencyPaid`, tasa si aplica), referencia **enmascarada**, `paymentDate` vs emisión, disclaimer país + "Generado con FitStack". Acciones: Imprimir (`react-to-print`, se mantiene), Descargar PDF (`receipts-service.downloadReceipt`), Enviar (`POST send-email`) con `mutationError('recibo', …)` + toast + `updateTag` + `refresh()`. Histórico `NULL` → estado "anterior al sistema" (sin número, sin descarga). |
| `apps/panel/components/payments/payment-detail-row.tsx` | Aplicar `maskPaymentDetails` de shared (Fase 0). `file` sigue como link "VER CAPTURA". |
| `apps/panel/components/payments/subscriptions-table.tsx` | Acción "Comprobante": visible solo con pagos `validated`; label "Emitir" vs "Reimprimir" según exista `receiptNumber`; badge ANULADO. Ocultar acciones sin permiso (autorización real = servidor). |
| `apps/panel/lib/services/pdf-service.ts` | Implementar contra `GET /:id/receipt` **o** borrar + limpiar imports. Sin tercera opción. |
| `apps/panel/types/dashboard.ts` (+ shared `IPayment`) | Agregar `receiptNumber?, receiptIssuedAt?, documentType?, receiptVoided?` a `ISubscription`/joins. Verificar la consulta de `subscriptions.repository.findAllPaginated` devuelve los nuevos campos (agregar al select si falta). |

## Criterios de aceptación

- Email recibido: asunto/número humano sin UUID, cuerpo corto, PDF adjunto **idéntico byte-a-byte** al descargado en panel.
- Miembro sin email → emisión OK en api-worker; `send-email` → 422 con mensaje de mostrador; dialog muestra toast y ofrece imprimir.
- Histórico sin PDF → email sin adjunto, sin error; dialog indica "anterior al sistema".
- Referencia larga aparece enmascarada en UI, impresión y email; `file` sigue como link.
- E2E panel (extender `e2e/panel/subscriptions.spec.ts` o nuevo `receipts.spec.ts` con fixture pago validado): abrir comprobante → ver número con formato + disclaimer VE → descargar → reenviar → toast éxito. `pnpm test:e2e:panel` verde.
- `pnpm typecheck`, `lint`, `test` verdes.

## Verificación

```bash
pnpm --filter panel test
pnpm test:e2e:panel
pnpm typecheck
```
