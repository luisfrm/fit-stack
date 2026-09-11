# Comprobantes Panel + Console — índice de tasks

> Solo planificación: no se implementa código en estas tasks, solo MDs. Orden de ejecución y dependencias.

## Orden recomendado

1. **Fase 0** (`fase-0-logica-pura-shared.md`) — lógica pura en `packages/shared/src/documents/`. Sin dependencias. Bloquea todo.
2. **Fase 1** (`fase-1-db-secuencias-panel.md`) — `organization_document_sequence` + columnas en `payment`. Requiere Fase 0 (tipos/formato).
3. **Fase 2** (`fase-2-emision-atomica-panel.md`) — cola `fit-receipt-events` (producer+consumer api-worker) + paso 1 número síncrono + paso 2 PDF en cola + barrido en jobs-worker + endpoints. Requiere Fase 0 + 1.
4. **Fase 3** (`fase-3-email-pdf-jobs-panel.md`) — 3A jobs-worker (adjunto desde R2) + 3B panel (dialog v2). Requiere Fase 2. 3A y 3B paralelizables entre sí.
5. **Fase 4** (`fase-4-config-fiscal-panel.md`) — settings fiscales + impuestos híbridos en el form. Requiere Fase 0. Paralelizable con Fase 3.
6. **Fase 5** (`fase-5-gaps-auditoria.md`) — reporte + `gaps[]` + auditoría. Requiere Fase 2.
7. **Fase 6** (`fase-6-cierre-panel.md`) — tests, E2E, docs, verificación manual. Requiere 0-5.
8. **C1** (`fase-c1-db-console.md`) — secuencia global + keys emisor FitStack. Requiere Fase 0. Config paralelizable con Fases 1-2.
9. **C2** (`fase-c2-emision-console.md`) — emisión SaaS automática. Requiere C1 + Fase 2 (patrón).
10. **C3** (`fase-c3-ui-console.md`) — descarga/reenvío console + cierre. Requiere C2 + Fase 3 (R2 en jobs).

## Mapa de módulos por capa

| Capa | Archivos que se tocan (total del proyecto) |
|---|---|
| `packages/shared` | `src/documents/` (nuevo: gate, fiscal-profile, tax-math, receipt-number, receipt-data), `src/index.ts`, `src/types.ts`, `tests/documents/` |
| `packages/database` | `src/schema.ts` (+2 migraciones: Panel Fase 1, Console C1) |
| `apps/api-worker` | `lib/schemas.ts`, `lib/r2.ts` (+put/get), `lib/receipt-storage-keys.ts` (nuevo: `receipts/<org>/<año>/<n>.pdf` + `platform/receipts/<año>/FS-n.pdf`), `services/receipt-pdf.ts` (nuevo, solo consumer de cola), `repositories/receipts.repository.ts` + `platform-receipts.repository.ts` (nuevos, sentencia única), `repositories/payments.repository.ts`, `services/receipts.service.ts` + `platform-receipts.service.ts` (nuevos, dos pasos), consumer de cola `onReceiptRender` (nuevo, `fit-receipt-events`), `services/subscriptions.service.ts`, `services/platform-subscriptions.service.ts`, `services/organizations.service.ts`, `services/reports.service.ts`, `routes/payments.route.ts` (+`receipts.route.ts` si se crea), `routes/subscriptions.route.ts` (schema), `routes/organizations.route.ts` (PATCH profile), `routes/reports.route.ts`, `routes/platform-organizations.route.ts` (schema), `package.json` (`@react-pdf/renderer`, solo path del consumer), `index.ts` + `wrangler.jsonc` (queue handler + producer/consumer de `fit-receipt-events` con DLQ) |
| `apps/jobs-worker` | `index.ts` (`receiptNumber` en eventos, `scheduled()` del barrido), `handlers/pdf.handler.ts`, `handlers/email.handler.ts` (contentType), `templates/payment-receipt.ts` (corto) + `templates/payment-receipt-short.ts` si se separa, `templates/org-payment-received.ts`, `wrangler.jsonc` (cron `*/10` + producer `RECEIPT_QUEUE`; el binding R2 ya existe) |
| `infrastructure/terraform` | `queues.tf` (cola + DLQ `fit-receipt-events{,-dlq}{env}`), `workers.tf` (producer/consumer api-worker, producer jobs-worker), `main.tf` (locals de nombres), `variables.tf`/`outputs.tf` (+ soporte de cron en `modules/worker` si no existe) |
| `apps/panel` | `components/payments/receipt-dialog.tsx`, `payment-detail-row.tsx`, `subscriptions-table.tsx`, `subscription-form.tsx`, `payment-section.tsx`, `lib/services/receipts-service.ts` (nuevo), `lib/services/emails-service.ts`, `lib/services/pdf-service.ts` (implementar o borrar), `types/dashboard.ts`, `app/(protected)/settings/organization/page.tsx` (+sección fiscal), `app/.../reports/receipts` (nuevo o pestaña) |
| `apps/console` | `app/dashboard/settings/` (emisor FitStack), detalle suscripción/org (descarga/reenvío), `lib/services/platform-subscriptions-service.ts` |
| Docs | `AGENTS.md`, `docs/PENDING.md`, `plan.md`, `e2e/panel/*`, `e2e/console/*` |

## Decisiones congeladas (de `plan.md`, no re-discutir por task)

PDF fuente de verdad · R2 inmutable · paso 1 número síncrono (sentencia única) + paso 2 PDF en cola dedicada `fit-receipt-events` (DLQ; sin rollback, `pdf_key NULL` = pendiente) · **email encolado por el paso 2 tras confirmar el PDF** (job de email nunca corre sin PDF en numerados) · **entrega duplicada de cola = sin segundo PDF ni segundo email** (`UPDATE … WHERE receipt_pdf_key IS NULL` con `RETURNING` como gate) · **barrido cron en jobs-worker cada 10 min** (`número sin PDF` > 15 min → re-encola) cierra el hueco publicación↔fila y cubre Panel + Console · contrato `receipt` con 3 estados (ready / pending 202 / pre_system 200 `available:false`; nunca 409) · render co-ubicado en api-worker, jobs solo adjunta · emisión automática al validar · impuestos híbridos con reason · reinicio anual · voided=ANULADO · sin backfill · emitir≠enviar · `isFormalTaxpayer` con declaración explícita · UUID invisible · dos secuencias (global FitStack `FS-N` vs por-org `{slug}-año-n`) · keys `receipts/<org>/…` simétricas (sin prefijo `cms/`) · `featuresSnapshot` no impreso pero exportable · proxy de país Console como ítem PENDING.

## Reglas de ejecución

- `pnpm db:generate → review → migrate` con aprobación; prohibido `db:push`.
- Timezone siempre de la org (`requireOrgTimezone`), nunca UTC del servidor.
- Toasts vía `mutationError` + genérico, nunca crudo del API; post-mutación `updateTag` + `router.refresh()`.
- Cada task cierra con `pnpm typecheck` (+ `lint`/`test`/`test:e2e` donde aplique).
