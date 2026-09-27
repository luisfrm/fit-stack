---
id: FS-0005
aliases: ["FS-0005"]
title: "Fix jobs-worker queue pipeline y error pre-PDF comprobantes"
status: in_progress # draft | planning | in_progress | blocked | done | cancelled
priority: critical # low | medium | high | critical
created: 2026-09-26
depends_on: [FS-0001, FS-0004]
pr: null
---

# FS-0005 — Fix jobs-worker queue pipeline y error pre-PDF comprobantes

## Problema

Al generar nuevos pagos tanto en `apps/panel` como en `apps/console`, los comprobantes en PDF y los correos de notificación no se procesaban ni recibían en el entorno local (`jobs-worker`). El worker no mostraba logs ni actividad de consumo de las colas de Cloudflare (`fit-receipt-events` y `fit-task-events`).

Al investigar la causa raíz en local:
1. `apps/jobs-worker/wrangler.jsonc` tenía configurados los `producers` de las colas, pero **carecía por completo de la sección `consumers`** en todos los entornos (`top-level`, `dev`, `staging`, `production`). Por tanto, el handler `queue()` de `jobs-worker` nunca era invocado por el runtime de Cloudflare Workers / Wrangler al encolar eventos desde `api-worker`.
2. Faltaba trazabilidad y logs diagnósticos estructurados en los servicios productores (`receipts.service.ts`, `platform-receipts.service.ts`) y en los consumidores (`jobs-worker/src/index.ts`, `pdf.handler.ts`).

Adicionalmente, en el entorno de producción persiste un fallo al procesar el pago `4`:
`receipt.render: checklist pre-PDF falló para pago 4: UUID técnico visible en campos del comprobante.`
El gate defensivo `checklistPrePdf` (definido en `@workspace/shared/src/documents/receipt-data.ts`) detecta un UUID en los campos visibles del comprobante (muy probablemente en `payment.payment_method` o en los detalles enmascarados), impidiendo la generación del PDF con datos no formateados o técnicos.

## Criterios de aceptación

- [x] Configuración de consumers en `apps/jobs-worker/wrangler.jsonc` para `fit-task-events` y `fit-receipt-events` con DLQ, `max_batch_size` y `max_batch_timeout` en todos los entornos (`top-level`, `dev`, `staging`, `production`).
- [x] Handlers y logs diagnósticos implementados en `apps/jobs-worker/src/index.ts` con funciones nombradas `processReceiptBatch` y `processTaskBatch`.
- [x] Trazabilidad y logs antes/después del encolamiento en `apps/api-worker/src/services/receipts.service.ts` y `apps/api-worker/src/services/platform-receipts.service.ts`.
- [x] Helper `resolveOrgReceiptAttachment` y verificación segura de `composed?.member` en `apps/jobs-worker/src/handlers/pdf.handler.ts`.
- [x] Verificación de typecheck en ambos workers (`pnpm turbo typecheck`).
- [x] **Identificación del Error en Prod**: Identificado en la BD de producción que el UUID no provenía de `payment_method` (que tenía "Binance"), sino del path de storage en R2 dentro de `payment_method_details` para el campo tipo `file` (`"cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b/receipts/..."`).
- [x] **Corrección de Raíz**: 
  - `packages/shared`: `toReceiptMaskedDetails` excluye adjuntos de tipo `file` para que paths de storage no se filtren al texto del comprobante / `maskedDetails`.
  - Frontend (`apps/panel`, `apps/console`): Validación estricta sin fallbacks silenciosos a IDs técnicos al enviar `paymentMethod`.
  - Backend (`apps/api-worker`): `paymentMethodSchema` con refinamiento `UUID_PATTERN` que rechaza UUIDs técnicos en todas las rutas de pago/suscripción.
- [x] **Resolución del Pago 4**: Sin necesidad de data patch manual en BD — al reprocesar el pago 4, `toReceiptMaskedDetails` omite el path de R2 y `checklistPrePdf` pasa con éxito.
- [x] **Infraestructura**: Verificada paridad de nombres Terraform ↔ wrangler.jsonc con `pnpm check:infra-parity` (production, staging, dev) para colas y DLQs (`fit-task-events-dlq` y `fit-receipt-events-dlq`).

## Alcance

| Capa                | Archivos / módulos |
| ------------------- | ------------------ |
| `apps/jobs-worker`  | `wrangler.jsonc` (consumers por entorno y DLQ); `src/index.ts` (handlers de lote y logs); `src/handlers/pdf.handler.ts` (helpers y null-checks) |
| `apps/api-worker`   | `src/services/receipts.service.ts` (logs y helper tax); `src/services/platform-receipts.service.ts` (logs y limpieza de perfil fiscal) |
| `packages/shared`   | `src/documents/receipt-data.ts` (`checklistPrePdf`), `src/documents/receipt-compose.ts` (composición del comprobante) |
| Base de datos       | Fila de pago `4` en producción (`payment.payment_method` u otros campos con UUID) |

## Fuera de alcance

- Reescribir el motor de render PDF (`pdf-lib`) → cubierto en [[FS-0004]].
- Reingeniería del modelo de numeración o almacenamiento R2 → cubierto en [[FS-0001]].
- Integraciones fiscales electrónicas de gobierno → [[fiscal]].

## Notas

- En Cloudflare Workers / Wrangler local, si un worker no define `consumers` explícitos en su `wrangler.jsonc`, `queue()` jamás recibe eventos locales aunque `api-worker` ejecute `queue.send()`.
- La regla de validación de `checklistPrePdf` es estricta por diseño: prohíbe exponer UUIDs técnicos directamente en comprobantes emitidos al cliente final.
- El error de prod en el pago `4` **NO está resuelto**: se encuentra diagnosticado conceptualmente, pero requiere intervención en BD / sanitización de métodos de pago.

## Plan de ejecución

> Generado por el agente `planner` en `plan.md`; el detalle por fase vive en `phases/`.
