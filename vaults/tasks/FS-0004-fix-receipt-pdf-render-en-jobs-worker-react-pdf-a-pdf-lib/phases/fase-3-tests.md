# Fase 3 — Tests: reescribir `receipt-pdf.test.ts` al formato pdf-lib

> Requiere: Fase 2.

## Objetivo

Adaptar la suite del render al nuevo motor sin perder cobertura: mismos 5 casos, nuevo extractor.

## Archivos

- `apps/jobs-worker/tests/receipt-pdf.test.ts` (rewrite del extractor + actualización del comentario de cabecera, quitando la referencia a react-pdf).

## Pasos

1. Reescribir el extractor: pdf-lib emite el texto como `<hex> Tj` (una línea por `Tj`), con los streams comprimidos en FlateDecode. El extractor debe **inflar los streams** (`inflateSync`) y matchear `<hex> Tj`, decodificando en latin1.
2. Mantener los 5 casos: PDF válido, datos de emisor/receptor, omisión de ausentes sin `---`, sello ANULADO presente/ausente, bloque de conversión de moneda.
3. Actualizar el comentario de cabecera del test (ya no menciona react-pdf).

## Criterio de done

Los 5 casos pasan contra el render con pdf-lib y el archivo no referencia react-pdf.

## Verificación

- `pnpm --filter jobs-worker test` en verde.
