# Fase 5 — Integridad y reporte de huecos + auditoría (Panel)

> Depende de: Fase 2 (números emitidos/anulados). Reutiliza columnas de Fase 1 (`receipt_voided, voided_by/at/reason`).

## Objetivo

El gym audita su correlativo: emitidos, an-nullados explicados, huecos sospechosos, totales por impuesto. `gaps[]` **distingue** "hueco" (sospechoso) de "anulado" (explicado) — nunca se tratan igual (decisión 6). Visibilidad de overrides manuales de impuestos.

## Contexto verificado

- `apps/api-worker/src/services/reports.service.ts` — hoy solo `getMonthlyRevenue` (agregados mensuales por moneda vía `paymentsRepo.getAggregatedPaymentsMonthly`). Patrón: `OrganizationDateManager(timezone)` + `AT TIME ZONE` en SQL para día local.
- `apps/api-worker/src/routes/reports.route.ts` — existe (ver mounts en `index.ts`); aquí se agrega el endpoint de comprobantes con `requireOrgPermission(REPORTS, READ)` + `requireOrgTimezone()`.
- `apps/api-worker/src/repositories/payments.repository.ts` — agregados existentes agrupan por `(currencyPaid, exchangeRateApplied)` y filtran `status='validated'`. El reporte nuevo necesita query por rango de `receipt_issued_at` (día local) + clasificación por `receipt_number/receipt_voided`.
- Regla multi-moneda (ya del repo, `finance.service`): **no sumar monedas distintas** — agrupar por `currencyPaid`.
- Panel reportes: verificar páginas existentes bajo `apps/panel/app/(protected)/...reports...` en implementación (filtros en URL `?from&to&status`, patrón RSC + `updateTag` + `refresh()`).
- Cache: `org:{id}:reports:revenue*` existe (1h, invalidada on-write en pagos). El nuevo reporte usa su propio namespace TTL 5 min, invalidado en `issue/void`.

## Crear / modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/routes/reports.route.ts` (extender; o `receipts.route.ts` de Fase 2 si se creó) | `GET /api/reports/receipts?from&to&status=issued\|pending\|voided\|gaps&method=&year=` con `requireOrgPermission(REPORTS, READ)` + `requireOrgTimezone()` (filtros por día local vía `AT TIME ZONE`). Respuesta paginada `{ receiptNumber\|null, member, plan, subtotal, taxTotal, amountPaid, currencyPaid, method, paymentDate, receiptIssuedAt, voided }` + resumen `{ count, byTax[] (agrupado por moneda), gaps[] }`. `gaps[]`: números ausentes en la secuencia del año = `hueco sospechoso`; con `receipt_voided=true` = `anulado` (con fecha/actor/motivo). |
| `apps/api-worker/src/services/reports.service.ts` | `getReceiptsReport(orgId, timezone, filters)` + `getReceiptGaps(orgId, year, timezone)` (detección de saltos contra `organization_document_sequence.last_number`). Totales agrupados por `currencyPaid`, nunca sumas mixtas. |
| Panel: vista `/dashboard/reports/receipts` (nueva o pestaña en reportes existente) | Filtros en URL (`?from&to&status`), tabla + badges (EMITIDO / ANULADO / SIN COMPROBANTE para históricos `NULL` — es correcto, no bug) + export CSV cliente + link "ver comprobante" → `ReceiptDialog` v2 (Fase 3). Listado de pagos con `tax_override_reason` no nulo (quién/por qué/cuándo). |
| `packages/shared/src/types.ts` | `IReceiptReportRow`, `IReceiptGapsResult`, filtros del reporte. |

## Criterios de aceptación

- Integración: pagos con y sin emitir → el reporte los clasifica (`issued` vs `pending`/sin comprobante); año con 1 anulado + 1 hueco real → `gaps[]` los clasifica correctamente (anulado explicado vs hueco sospechoso); anular no re-numera ni libera.
- Totales multi-moneda agrupados por moneda, sin sumas mixtas.
- E2E: filtra por rango y exporta CSV; emitir → el reporte cambia tras `refresh()` (invalidación verificada).

## Verificación

```bash
pnpm --filter api-worker test:integration
pnpm test:e2e:panel
pnpm typecheck
```
