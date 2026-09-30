---
id: FS-0006
aliases: ["FS-0006"]
title: "Refactor: unificar el motor de comprobantes Panel↔Console con adapter"
status: planning # draft | planning | in_progress | blocked | done | cancelled
priority: medium # low | medium | high | critical
created: 2026-09-30
depends_on: [FS-0001, FS-0002, FS-0004]
pr: null
---

# FS-0006 — Refactor: unificar el motor de comprobantes Panel↔Console con adapter

## Problema

El motor de comprobantes está **duplicado casi línea a línea** entre los dos emisores (gym en `apps/panel` y FitStack en `apps/console`). No son espejos *byte-idénticos* (usan tablas y columnas distintas y escalas de seguridad distintas), así que **no** obtienen el beneficio de la excepción de repos compartidos de AGENTS §1: son lógica paralela que hay que mantener dos veces.

Inventario verificado del paralelismo:

| Responsabilidad | Panel (gym) | Console (SaaS) |
| --- | --- | --- |
| Paso 1 (orquestación) | `services/receipts.service.ts` (~533 líneas) | `services/platform-receipts.service.ts` (~473) |
| Repo (SQL de la garantía) | `packages/database/.../receipts.repository.ts` (~407) | `.../platform-receipts.repository.ts` (~396) |
| Paso 2 (consumer + gates) | `handleReceiptRender` en `jobs-worker/.../receipt.handler.ts` | `handlePlatformReceiptRender` (mismo archivo) |
| Render + notify | `renderAndStoreReceiptPdf` / `dispatchReceiptNotification` | `renderAndStorePlatformReceiptPdf` / `dispatchPlatformNotification` |
| Compose (filas → `ReceiptData`) | `buildReceiptDataFromComposed` | `buildPlatformReceiptDataFromComposed` |
| Email | rama gym de `pdf.handler.ts` (`email.payment_receipt`) | rama SaaS (`email.org_payment_received`) |

Consecuencias actuales:

1. **Riesgo de deriva.** El propio código admite el problema con comentarios "ANTI-DRIFT: debe coincidir" (`lib/receipt-report.ts`, `classifyReceiptState`, filtro SQL `issued`). Una corrección aplicada en un lado puede no reproducirse en el otro.
2. **Mapeo de `ReceiptData` repetido 4 veces.** El mismo `payment → ReceiptData` se re-escribe en `receipt.handler.ts` (`buildComposeInput` / `buildPlatformComposeInput`) y en los `getReceiptState` / `getPlatformReceiptState` de los dos servicios.
3. **Correcciones/tests pagados dos veces.** FS-0001/FS-0002/FS-0004 requirieron tocar ambos lados; cada nueva invariante fiscal multiplica el coste.
4. **Ruido de revisión.** ~4.000 líneas de lógica espejo compiten con la lógica real en cada PR del módulo.

### Objetivo

Introducir un **adapter (puerto) por emisor** que parametrice un **core único** del motor, de modo que Panel y Console sean *perfiles* de configuración y no dos implementaciones. El refactor es **conductual (behavior-preserving)**: mismas factories, mismos métodos públicos, mismos códigos de error, mismo evento de cola, mismas keys R2, mismos gates de BD. Los tests existentes deben pasar **sin editarlos**.

## Criterios de aceptación

- [ ] Existe **un** orquestador de paso 1 y **un** consumer de paso 2 compartidos; Panel y Console aportan solo un *perfil* de diferencias.
- [ ] El mapeo de `ReceiptData` vive en **un** punto por emisor (no en 4), y el core de composición es único.
- [ ] **Cero cambios** en los tests existentes (excepto adiciones). `pnpm -w test` verde.
- [ ] Contrato congelado intacto: factories/métodos públicos, `ReceiptError` con sus `code`/`status`, shape de `ReceiptRenderEvent`, keys R2 deterministas, gates `WHERE ... IS NULL`, tipos de email y TTLs del sweep.
- [ ] Reducción neta de líneas en el motor ≥ 1.500 (medida antes/después sobre los archivos del inventario).
- [ ] Tests de **equivalencia** del compose: para fixtures representativas, la nueva ruta produce un `ReceiptData` idéntico (`toEqual`) al de la implementación previa para ambos emisores.
- [ ] `pnpm typecheck` (9/9), `pnpm lint` (0 errores), `pnpm db:check` sin drift.
- [ ] Código muerto confirmado eliminado (template `payment-receipt.ts`, bloque `if` vacío) y ruta `change-plan` resuelta (montar o retirar del console).

## Alcance

| Capa | Archivos / módulos |
| --- | --- |
| `packages/shared` | `src/documents/receipt-compose.ts` (núcleo único + helpers de mapeo), `receipt-data.ts` si hace falta exportar tipos; **sin cambios de contrato** |
| `packages/database` | `src/repositories/receipts.repository.ts`, `platform-receipts.repository.ts` (solo Fase 4, condicional) |
| `apps/api-worker` | nuevo `src/lib/receipt-emission.ts` (core + tipos del adapter); `services/receipts.service.ts` y `platform-receipts.service.ts` (pasan a perfiles finos); `lib/receipt-report.ts` (clasificación única) |
| `apps/jobs-worker` | `src/handlers/receipt.handler.ts` (core de render/notify + perfiles), `src/handlers/pdf.handler.ts` (resolución de adjunto compartida) |
| Backend | Sin rutas nuevas, sin columnas nuevas, sin migraciones |

## Fuera de alcance

- **No** se toca la lógica de negocio (periodo acumulativo, compensación, status derivados): solo se reubica.
- **No** se cambia el esquema de BD ni se agregan migraciones.
- **No** se tocan colas, DLQ, `wrangler.jsonc` ni Terraform.
- **No** se "mejora" el modelo de comprobantes (más estados, refactor de `receipt_voided` vs `payment.status`): ese análisis vive en `vaults/backlog/`.
- Montar/retirar `POST /api/platform/subscriptions/change-plan` es un **fix de una línea**; el rediseño mayor (si aplica) va en task aparte.
- Unificación de los **repos** compartidos con adapter de tabla: condicional (Fase 4), puede cerrarse como "evaluado y descartado" si el coste de tipado Drizzle supera el beneficio.

## Notas

- Restricción dura: **sin transacciones interactivas** (driver HTTP de Neon); la compensación explícita se conserva intacta (`lib/subscription-compensation.ts` no se toca).
- Invariante intocable: *validado ⇔ numerado*; **void ≠ cancel**; ANULADO es un artefacto (`-anulado.pdf`), el PDF de emisión nunca se reescribe.
- Regla de proyecto: **1 task = 1 PR** (rama `feat/FS-0006-unificar-motor-comprobantes-adapter`).
- El refactor no debe introducir una indirección *peor* que la duplicación: límite explícito de ≤ ~10 estrategias por perfil y cada estrategia ≤ 5 líneas.
- Base de contratos: [vaults/tasks/FS-0001-payment-receipts/plan.md](FS-0001-payment-receipts/plan.md) y [FS-0002](FS-0002-subscription-integrity-compensacion-y-periodo-servidor/plan.md).

## Plan de ejecución

> En `plan.md`. El detalle por fase vive en `phases/` (a generar al aprobar el plan).
