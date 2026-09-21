# Fase 2 — Rewrite de `receipt-pdf` con pdf-lib (una sola página)

> Requiere: Fase 1. Es el corazón del fix.

## Objetivo

Reescribir el motor de render con `pdf-lib`, compatible con workerd, reproduciendo **todo el contenido** actual en **una sola página** (decisión aprobada 1: es un comprobante de pago).

## Archivos

- `apps/jobs-worker/src/receipt-pdf.tsx` → `apps/jobs-worker/src/receipt-pdf.ts` (renombrar con `git mv`, reescribir el contenido).
- **No tocar**: `src/handlers/receipt.handler.ts:143/435` (import lazy), `:144-147/436-439` (llamada) ni el `renderFormat`. Tampoco cambia nada en `packages/shared` ni en `packages/database`.

## Restricciones duras (no negociables)

- Firma **exacta**: `renderReceiptPdfBytes(data: ReceiptData, format: CurrencyFormat = 'latam'): Promise<Uint8Array>`.
- El módulo sigue llamándose `receipt-pdf`: los tests de integración de `api-worker` lo mockean con `vi.mock('../../../jobs-worker/src/receipt-pdf')` y deben seguir resolviendo la ruta.
- Pérdida aceptada: `letterSpacing`, flex y `borderRadius`. Fidelidad de **contenido**, no de píxeles.

## Especificación del documento

- Fuentes: StandardFonts `Helvetica` / `HelveticaBold` (`Oblique` solo si hace falta). Página A4 `[595.28, 841.89]`, margen 40pt.
- Contenido (mismo que hoy, en orden): cabecera del emisor (`legalName`/`name` en mayúsculas; línea `taxLabel: taxId` **omitida si es null**), etiqueta del documento en mayúsculas + `#number` + fecha, sello ANULADO rojo si `voided`, columnas emisor (dirección) / receptor (nombre + `docLabel: documentId`), detalles enmascarados de transacción, tabla (plan, período, método, total), totales (subtotal, líneas de impuestos `name (rate*100%)`, total pagado, conversión `Tasa aplicada: 1 {base} = {rate} {pagada}` + `Equivalente` cuando aplique, `Pagado el ...`), disclaimer y `generatedBy`.
- Conservar `formatDateEs` (Intl + timezone) y `formatCents` tal cual.
- **Sanitizar todo texto de usuario contra WinAnsi** usando `font.getCharacterSet()`; nunca emitir el placeholder `---` (lo prohíbe `checklistPrePdf`): sin dato → se omite la línea.
- Envolver el texto con `maxWidth`; truncar tokens irrompibles con elipsis para garantizar la página única.

## Criterio de done

- El módulo compila sin JSX, expone la firma exacta y genera un PDF de una página con todo el contenido arriba listado, vigente y ANULADO.
- `checklistPrePdf` sigue pasando sobre los datos (sin `---` en la salida).

## Verificación

- `pnpm --filter jobs-worker typecheck` en verde.
- Inspección visual preliminar del PDF (la inspección formal con los dos casos es de la Fase 5).
