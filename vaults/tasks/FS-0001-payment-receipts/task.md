---
id: FS-0001
aliases: ["FS-0001"]
title: Payment receipts (Panel + Console)
status: done
priority: high
created: 2026-08-01
depends_on: []
pr: null
---

# FS-0001 — Payment receipts (Panel + Console)

> Task histórica ya cerrada. El **plan maestro y estado** viven en `plan.md`; el detalle de ejecución en `phases/` y las correcciones del track C0–C9 en `correcciones-comprobantes.md`.

## Problema

Los pagos de membresía (Panel: gimnasio → miembro) y los pagos SaaS (Console: FitStack → organización) necesitaban un **comprobante de pago** con correlativo propio: un registro interno verificable, descargable, reenviable por email y auditable — **sin** homologación fiscal (el emisor no declara impuestos).

Requerimientos duros:

- Correlativo **atómico** e irreutilizable (Panel: `{slug}-año-n` por org y año; Console: `FS-N` global continuo).
- Emisión en **dos pasos**: número síncrono en la transacción de validación + render del PDF asíncrono (Cloudflare Queues).
- El PDF es la **fuente de verdad** e inmutable en R2; el email solo se dispara tras confirmar el PDF.
- **ANULADO** es un artefacto propio (PDF con sello), no solo un flag.
- **Gating fiscal fail-closed**: nunca se detallan impuestos que el emisor no declaró.
- **Auditoría del correlativo** (`gaps[]`) en Panel y Console.

## Criterios de aceptación

- [x] Un pago validado obtiene número de comprobante de forma atómica, sin duplicados ni huecos por carrera.
- [x] El PDF se renderiza en `jobs-worker` (nunca en `api-worker`) y se sirve inmutable desde R2.
- [x] El email adjunta el PDF y se **reintenta por el barrido** si se pierde (`receipt_notified_at` como gate).
- [x] Contrato de comprobante con 3 estados (`ready` / `pending` 202 / `pre_system`), nunca 409 en lectura.
- [x] Anular genera `<numero>-anulado.pdf` y deja de servir el PDF de emisión (**fail-closed**).
- [x] Sin `fiscalConfig.isFormalTaxpayer` no hay desglose de impuestos (400 al intentar activarlos).
- [x] El correlativo se audita con `gaps[]` diferenciando hueco de anulación (Panel y Console).

## Alcance (cerrado)

| Capa                     | Módulos                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`        | `src/documents/` (gate, fiscal-profile, tax-math, receipt-number, receipt-data, receipt-compose, receipt-gaps, receipt-events, receipt-storage-keys) |
| `packages/database`      | `schema.ts` + migraciones `0012`–`0018`; repos compartidos `receipts.repository.ts` / `platform-receipts.repository.ts`                              |
| `apps/api-worker`        | `receipts.service`, `platform-receipts.service`, rutas `payments` / `platform-subscriptions` / `reports`, producer `RECEIPT_QUEUE`                   |
| `apps/jobs-worker`       | `handlers/receipt.handler.ts`, `receipt-pdf.tsx`, `sweepPendingReceiptPdfs`, cron de barrido                                                         |
| `apps/panel` / `console` | Diálogo de comprobante, reporte de auditoría, emisor/Facturación, descarga y reenvío                                                                 |

## Fuera de alcance

- Homologación fiscal / facturación electrónica formal (PAC/PAD) → [[fiscal]].
- Devoluciones (`refunded`) → [[pagos-suscripciones]].
- `claim-then-number` y `fitstack_country_code` → [[comprobantes]] / [[fiscal]].

## Estado

Cerrada. El track C0–C9 (correcciones post-auditoría) también quedó cerrado — ver `correcciones-comprobantes.md`. Pendientes residuales en [[backlog/README|backlog]].
