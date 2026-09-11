# Fase 0 — Lógica pura en `@workspace/shared` (sin DB, sin Workers)

> Sin dependencias de fases. Bloqueante de todo lo demás. 100% unit-testeable, sin Postgres.

## Objetivo

Un solo motor de reglas fiscales puro y testeado: el país da el default (`COUNTRIES`), la org lo sobreescribe (`fiscalConfig`), cero hardcode en consumidores. Aquí nacen `resolveFiscalProfile`, `computeTaxes` + override auditado, `resolveDocumentLabel` (gate defensivo), formateo de números correlativos, enmascarado de referencias y el contrato `ReceiptData` + `checklistPrePdf`.

## Contexto verificado

- `packages/shared/src/constants.ts` — `COUNTRIES` ya trae `docLabel`, `taxLabel`, `docType[]`, `legalDisclaimer[]`, `countryTaxes[]` (VE: IVA 16%), `conditionalTaxes[]` (VE: IGTF 3% si `currencyPaid !== 'VES'`), PE: IGV 18%, US: `countryTaxes: []`. Solo se consume, no se repara.
- `packages/shared/src/types.ts` — ya existen `ITaxDetail { name, rate, amount }`, `IPayment` (con `subtotal?/taxTotal?/taxDetails?`), `IPaymentMethodDetails`. Falta todo lo de documento correlativo.
- `packages/shared/src/index.ts` — re-exporta `constants, types, ai, prompts, access-control, auth-config, permissions, features/catalog, content, date, settings, defaults`. El nuevo módulo debe exportarse aquí.
- `packages/shared` ya depende de `zod` (lo usa `content.ts` para `BLOCK_SCHEMAS`).
- `apps/api-worker/src/lib/schemas.ts` — solo tiene `paymentMethodDetailsSchema` (array `{ label, value, type?: text|file|number }`). No hay schema de `taxDetails` ni de `fiscalConfig`; `createSubSchema` (en `routes/subscriptions.route.ts`) no acepta `subtotal/taxTotal/taxDetails` → hoy esas columnas existen en DB pero son inalcanzables por API.
- Tests shared: `packages/shared/tests/*.test.ts` (existe `features.test.ts` como ejemplo de patrón).

## Crear

| Archivo | Contenido |
|---|---|
| `packages/shared/src/documents/document-label-gate.ts` | `resolveDocumentLabel({ taxId, isFormalTaxpayer, hasFiscalHomologation }): 'Comprobante de pago' \| 'Factura'`. Gate defensivo: si falta **cualquiera** de las 3 condiciones → `"Comprobante de pago"` aunque el input pida `"Factura"`. Hoy `hasFiscalHomologation` es siempre `false` (constante explícita, no silenciosa) → el gate devuelve Comprobante por construcción. |
| `packages/shared/src/documents/fiscal-profile.ts` | `FiscalConfigSchema` (zod: `{ documentLabel?, isFormalTaxpayer?, taxes?: [{ name, rate, enabled }], disclaimerOverride?: string[] }`) + `resolveFiscalProfile(countryCode, fiscalConfig)` → `{ taxes, disclaimer, docLabel, taxLabel, isFormalTaxpayer }`. Defaults de `COUNTRIES[code]`, override de la org. Parser de tasas string→number (`"16%" → 0.16`) vive aquí. Redondeo documentado (half-up, 2 decimales) aquí y en ningún otro lado. |
| `packages/shared/src/documents/tax-math.ts` | `computeTaxes(subtotal, taxes[]) → { subtotal, taxDetails, taxTotal, total }` (automático por defecto) + `applyTaxOverride(..., { taxTotal, taxDetails, taxOverrideReason, actor })` → lanza si `taxOverrideReason` vacío (híbrido decisión 4). Impuestos sobre `amountPaid` en `currencyPaid`. |
| `packages/shared/src/documents/receipt-number.ts` | `formatPanelReceiptNumber(slug, year, seq)` → `{slug}-2026-000045` (zero-pad 6, sin `organization.id` completo) + `formatConsoleReceiptNumber(seq)` → `FS-0000001` + `parse/validate` de ambos. Año = número de 4 dígitos. |
| `packages/shared/src/documents/receipt-data.ts` | Contrato `ReceiptData` (emisor, receptor, identificación, detalle snapshot, periodo, montos+moneda+tasa, método enmascarado, `paymentDate` vs fecha emisión, impuestos, pie legal) + `checklistPrePdf(data)` que valida el checklist: número presente, UUID ausente en campos visibles, disclaimer del emisor, tasa si moneda difiere. |
| `packages/shared/src/documents/index.ts` | Re-exports del módulo. |
| `packages/shared/tests/documents/*.test.ts` | Casos: gate fuerza Comprobante con 2/3 condiciones (matriz de 8); override sin reason lanza; VE con `USD` incluye IGTF y con `VES` no; CO IVA 19%; PE IGV; US sin impuestos; override org (tasa off, disclaimer custom); formato/parse de ambos números; checklist detecta UUID visible y tasa faltante; `maskReference` con valores cortos/vacíos. |

## Modificar

| Archivo | Cambio |
|---|---|
| `packages/shared/src/index.ts` | Agregar `export * from './documents'`. |
| `packages/shared/src/types.ts` | `IPayment`: agregar `receiptNumber?: string \| null`, `receiptIssuedAt?: string \| null`, `receiptPdfKey?: string \| null`, `documentType?: 'receipt' \| 'invoice'`, `receiptVoided?: boolean`, `taxOverrideReason?: string \| null`, `voidedBy?/voidedAt?/voidReason?` (auditoría anulación). Nuevo `IFiscalConfig`, `IReceiptData` (re-export del contrato de `documents/` si se define ahí). |
| `apps/api-worker/src/lib/schemas.ts` | Agregar `taxDetailSchema` (`{ name, rate: number, amount: number }`), `fiscalConfigSchema` (re-export del de shared), `taxOverrideSchema`. Extender el objeto `payment` de `createSubSchema` en `routes/subscriptions.route.ts` con `subtotal?`, `taxTotal?`, `taxDetails?` (array de `taxDetailSchema`), `taxOverrideReason?`. |

## No tocar

`packages/database/src/schema.ts`, workers, UI, rutas (salvo el schema Zod), `COUNTRIES`.

## Criterios de aceptación

- `pnpm --filter @workspace/shared test` verde con la matriz completa (gate 8 combinaciones → solo 1 da `invoice`, y hoy `hasFiscalHomologation=false` lo bloquea todo).
- `pnpm typecheck` + `pnpm lint` verdes.
- Ningún consumidor hardcodea etiquetas/tasas: todo default sale de `COUNTRIES[countryCode]`.

## Verificación

```bash
pnpm --filter @workspace/shared test
pnpm typecheck
pnpm lint
```
