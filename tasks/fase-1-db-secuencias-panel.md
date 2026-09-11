# Fase 1 — DB Panel: secuencia unificada + columnas de comprobante

> Depende de: Fase 0 (tipos `document_type`, formato de número). Una sola migración. Flujo estricto `generate → review → migrate`, **prohibido `db:push`** en ramas compartidas.

## Objetivo

Numeración correlativa por organización / tipo de documento / año, sin colisiones bajo concurrencia de Workers, + campos del comprobante en `payment`. Sin backfill: el histórico queda `NULL` (decisión 7).

## Contexto verificado

- `packages/database/src/schema.ts` — `payment` (líneas ~402-439) tiene snapshots, montos, `paymentMethodDetails`, `subtotal/taxTotal/taxDetails`, `paymentDate`, índices por subscription/fecha/org+status. **No tiene** `receipt_number` ni nada de documento. No existe ninguna tabla `*_sequence`.
- `paymentRelations` ya existe (org/member/subscription) — extender si la secuencia necesita relations (no obligatorio).
- Convención repo: sin `pgEnum`, `document_type` como `text` validado por Zod.
- Año de la secuencia = año **local del emisor** (su timezone), nunca año del servidor.
- Tests de integración api-worker: `apps/api-worker/tests/integration/*.test.ts` contra rama Neon (`TEST_DATABASE_URL` en `apps/api-worker/.dev.vars`), con `describe.skipIf` sin esa variable y guards anti-producción. Patrón a reutilizar para el test de carrera.

## Crear (DB + repositorio)

```sql
-- Conceptual (Drizzle pgTable). PK triple = reinicio anual por org y tipo.
TABLE organization_document_sequence (
  organization_id  text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  document_type    text NOT NULL,          -- 'receipt' | 'invoice' (Zod; hoy solo 'receipt' efectivo)
  year             integer NOT NULL,       -- año LOCAL del emisor
  last_number      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, document_type, year)
);
TABLE payment ADD COLUMN
  receipt_number      text,                -- humano '{slug}-2026-000045', NULL = anterior al sistema
  document_type       text NOT NULL DEFAULT 'receipt',
  receipt_issued_at   timestamptz,         -- emisión (≠ paymentDate)
  receipt_pdf_key     text,                -- key R2 del PDF inmutable
  tax_override_reason text,                -- auditoría override manual (decisión 4)
  receipt_voided      boolean NOT NULL DEFAULT false,  -- ANULADO conserva número (decisión 6)
  voided_by           text,                -- actor (user.id) que anuló
  voided_at           timestamptz,         -- cuándo se anuló
  void_reason         text;                -- motivo de anulación
-- Índices: UNIQUE (organization_id, receipt_number) WHERE receipt_number IS NOT NULL;
-- índice (organization_id, receipt_issued_at) para reporte de huecos (Fase 5).
```

| Archivo | Cambio |
|---|---|
| `packages/database/src/schema.ts` | Nueva tabla `organizationDocumentSequence` + columnas en `payment` + índices de arriba. |
| Migración generada | `pnpm db:generate` → revisar SQL a mano → `pnpm db:migrate` con aprobación explícita. |
| `apps/api-worker/src/repositories/receipts.repository.ts` (nuevo, factory `createReceiptsRepository(db)`) | `nextDocumentNumber(orgId, type, year)`: 1) `INSERT … ON CONFLICT (org,type,year) DO NOTHING` (crea la fila del año si falta — **corrección de concurrencia**: sin esto los dos primeros comprobantes del año colisionan en el `SELECT FOR UPDATE`); 2) `SELECT last_number … FOR UPDATE` → 3) `UPDATE SET last_number = n+1` → devuelve `n+1`. Todo en `db.transaction`. Alternativa si el driver serverless no soporta `FOR UPDATE` en transacción: `UPDATE … SET last_number = last_number+1 RETURNING` (atómico sin SELECT previo, con upsert previo igual). Decidir en implementación con test de carrera. Además: `attachReceipt(paymentId, {...})` con guarda `WHERE receipt_number IS NULL` (idempotencia a nivel SQL), `markVoided(paymentId, { by, reason })` (setea flags, nunca libera número), `findByReceiptNumber(orgId, receiptNumber)`. |
| `apps/api-worker/src/repositories/payments.repository.ts` | Extender interfaz `IPayment` + `create`/`findById` para los nuevos campos (lectura/escritura), sin cambiar lógica de agregados. |

## Modificar

Solo `schema.ts` + `payments.repository.ts` (arriba). Ninguna ruta ni servicio en esta fase.

## No hacer

- Sin backfill de históricos (quedan `NULL`).
- Sin cambios en `platform_subscription_payment` (eso es C1).
- Sin tocar R2, jobs, panel.

## Criterios de aceptación

- Migración aplica limpio en rama Neon de test; `pnpm db:check` verde.
- Test de integración `apps/api-worker/tests/integration/receipts-sequence.test.ts`: N llamadas concurrentes a `nextDocumentNumber` misma org/año → números distintos y consecutivos, sin duplicados; segundo `attachReceipt` sobre el mismo pago devuelve el existente (no duplica); `receipt_number` único por org; pago viejo sin número sigue válido (`NULL`).
- Pago `voided` conserva su número (`receipt_voided=true`).

## Verificación

```bash
pnpm db:generate
# revisar SQL
pnpm db:migrate
pnpm db:check
pnpm --filter api-worker test:integration
pnpm typecheck
```
