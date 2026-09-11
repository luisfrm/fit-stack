# Track Console C1 — DB + config del emisor FitStack

> Depende de: Fase 0 (formatos `FS-N`, gate, `ReceiptData`). Paralelizable con Fases 1-2 de Panel solo en su parte de config (keys), no en emisión. Espejo de Fase 1 pero global.

## Objetivo

Secuencia **global única** (FitStack es un solo emisor) + columnas de documento en `platform_subscription_payment` + identidad legal de FitStack en `platform_setting` (hoy inexistente → gate invoice bloqueado por construcción).

## Contexto verificado

- `packages/database/src/schema.ts` — `platformSubscriptionPayment` (líneas ~186-234): snapshots plan, montos (`amountPaid` bigint centavos, `baseAmount`), `exchangeRateApplied`, método, `status/dueDate/paidAt/refundedAt`. **Sin** columnas de documento. `platformSetting` KV singleton (`key unique`).
- `packages/shared/src/settings.ts` — `DEFAULT_PLATFORM_SETTINGS` (primary_currency USD, active_currencies, currency_format latam, active_payment_methods, ai_provider_default, free_tier flag). Sembradas en `/api/init` vía `init.service` (`platformSettingsRepo.upsert` por key). Aquí se agregan las 4 del emisor.
- `apps/api-worker/src/services/platform-subscriptions.service.ts` — `renewSubscription/registerPayment/updatePaymentStatus(→VALIDATED extiende periodo)` + `renewOrgSubscription` (autoservicio org → `processing`). La emisión (C2) se engancha donde el pago pasa a validado.
- Console settings: `apps/console/app/dashboard/settings/...` (ver subpáginas General/Currencies/FreeTier/AI-Provider en implementación; tag de cache `console:settings`).

## Crear (DB + config)

```sql
TABLE platform_document_sequence (
  document_type  text PRIMARY KEY,   -- 'receipt' | 'invoice' (global, sin org)
  next_number    integer NOT NULL DEFAULT 0
);
-- NOTA: el doc propone secuencia global continua (FS-0000001). Si se quiere
-- reinicio anual también aquí, usar PK (document_type, year) como en Panel.
-- Default: seguir el doc (continua) salvo pedido explícito.
TABLE platform_subscription_payment ADD COLUMN
  receipt_number     text UNIQUE,     -- 'FS-0000001', NULL = histórico
  receipt_issued_at  timestamptz,
  receipt_pdf_key    text;            -- 'platform/receipts/<año>/FS-<n>.pdf'
```

Nuevas keys `platform_setting` (seed en `DEFAULT_PLATFORM_SETTINGS` + edición en console): `fitstack_legal_name`, `fitstack_tax_id`, `fitstack_address`, `fitstack_country_code`. Vacías hoy → emisor genérico "FitStack" y gate invoice bloqueado (coherente con "hoy NO puede ser invoice: FitStack sin RIF").

| Archivo | Cambio |
|---|---|
| `packages/database/src/schema.ts` | Tabla + columnas + migración (`generate → review → migrate`, sin backfill, prohibido `push`). |
| `packages/shared/src/settings.ts` | 4 keys en `DEFAULT_PLATFORM_SETTINGS`. |
| `apps/api-worker/src/repositories/platform-receipts.repository.ts` (nuevo) | `nextPlatformDocumentNumber(type)` (misma técnica upsert + `FOR UPDATE` o `UPDATE…RETURNING`) + `attachPlatformReceipt`. |
| `apps/console/.../settings/` | UI de "Emisor FitStack" (4 campos) con tag `console:settings`. |

## Criterios de aceptación

- Migración limpia + `db:check` verde; `FS-0000001` formatea/valida (Fase 0); settings editables desde console; emisor vacío → comprobante sale con "FitStack" genérico + gate Comprobante.

## Verificación

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
pnpm typecheck
```
