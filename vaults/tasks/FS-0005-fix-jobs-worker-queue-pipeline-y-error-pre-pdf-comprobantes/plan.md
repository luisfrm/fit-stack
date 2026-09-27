# Plan de ejecución — FS-0005: fix jobs-worker queue pipeline y error pre-PDF comprobantes

> Task: [[FS-0005]] · depende de [[FS-0001]] y [[FS-0004]] · **1 task = 1 PR**.

## Diagnóstico y Estado

- **Local**: `apps/jobs-worker/wrangler.jsonc` no tenía declarados los `consumers` de las colas `fit-task-events` y `fit-receipt-events`. Al emitir pagos en local desde `apps/panel` o `apps/console`, `api-worker` colocaba los mensajes en las colas pero `jobs-worker` nunca los consumía.
- **Producción**: Existe una falla al generar el PDF del pago `4`:
  `receipt.render: checklist pre-PDF falló para pago 4: UUID técnico visible en campos del comprobante.`
  El checklist `checklistPrePdf` escanea cadenas visibles en el comprobante (número, nombres, método de pago, detalles enmascarados). Si alguna contiene un UUID regex (`[0-9a-f]{8}-[0-9a-f]{4}-...`), rechaza el render para evitar emitir documentos con identificadores crudos de base de datos.
- **Estado actual**:
  - Configuración de consumers y observabilidad: **COMPLETADA** en código.
  - Error de UUID en producción (pago 4): **PENDIENTE DE CORRECCIÓN**.

## Orden de fases

| Fase | Nombre | Estado | Qué entrega |
| ---- | ------ | ------ | ----------- |
| 1 | Configuración de consumers en `wrangler.jsonc` | ✅ Completada | Consumers para `fit-task-events` y `fit-receipt-events` en top-level, dev, staging y production |
| 2 | Trazabilidad y refactor de handlers | ✅ Completada | Logs antes/después de `send()` en `api-worker`; `processReceiptBatch` y `processTaskBatch` en `jobs-worker`; helper de adjunto en `pdf.handler.ts` |
| 3 | Diagnóstico y corrección de UUID visible (Prod) | ⏳ Pendiente | Localización del campo con UUID en pago 4, corrección en origen (checkout/guardado) y script/data patch para el pago 4 |
| 4 | Verificación de colas DLQ y prueba end-to-end | ⏳ Pendiente | Confirmación de colas DLQ en Cloudflare y verificación de flujo completo panel/console → jobs-worker → PDF en R2 y email |

## Detalle por fases

Las especificaciones detalladas residen en `phases/`:
- `phases/phase-1-wrangler-consumers.md`: Detalle de configuración de wrangler.
- `phases/phase-2-logging-observability.md`: Cambios aplicados en api-worker y jobs-worker.
- `phases/phase-3-prod-uuid-fix.md`: Pasos para aislar, corregir y parchar el UUID en pago 4.
- `phases/phase-4-infra-verification.md`: Verificación de infraestructura en Cloudflare y DLQs.
