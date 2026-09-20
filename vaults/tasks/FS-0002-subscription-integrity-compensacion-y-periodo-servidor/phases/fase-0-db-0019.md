# Fase 0 — DB: columna del motivo de override (migración 0019)

> Requiere: rama apilada `fix/subscription-integrity` desde `fix/receipt-emission-integrity` (hereda la migración 0018). Bloquea a: fase-4 (persistir `endDateOverrideReason`). Commit: `feat(database): persist the end date override reason (0019)`.

## Objetivo

Persistir el motivo auditable cuando el operador acorta un periodo vigente con un `endDate` explícito. Columna aditiva nullable, sin backfill: `NULL` = periodo calculado por el servidor o histórico anterior al sistema.

## Modificar

| Archivo | Cambio |
|---|---|
| `packages/database/src/schema.ts` | En `subscription`: `endDateOverrideReason: text('end_date_override_reason')` (nullable, sin default, sin `.$type`). Nada de `pgEnum`. |
| `packages/database/migrations/0019_*.sql` | Generada con `pnpm db:generate`; debe contener solo `ALTER TABLE "subscription" ADD COLUMN "end_date_override_reason" text;` (+ entrada en `meta/_journal.json`). Revisar el diff antes de migrar. |
| `apps/api-worker/src/repositories/subscriptions.repository.ts` | `create()` acepta `endDateOverrideReason?: string \| null` y lo persiste; `findAllPaginated` y `findAllVisible` lo exponen en las filas (auditoría del override en listados). `ISubscriptionDTO` suma el campo opcional. |

## No tocar

- Ninguna otra tabla, índice o columna; `payment`, `platform_subscription*` y secuencias quedan intactas.
- Sin backfill ni default: las filas históricas quedan en `NULL` (estado terminal documentado).
- Sin `db:push` (prohibido en ramas compartidas).

## Detalle

1. Agregar la columna en `schema.ts` junto a `cancelledAt`/`createdAt` de `subscription`.
2. `pnpm db:generate` → leer el SQL generado completo (verificar que no arrastre cambios ajenos de la rama base) → `pnpm db:check` → `pnpm db:migrate` (con aprobación explícita del humano).
3. Extender `create()` del repo gym (único escritor del panel en esta task) y los dos selects de listado. El resto de escritores de `subscription` no existe (sin `delete`, `updateStatus`/`cancel` no tocan fechas).

## Criterio de done

- `schema.ts` declara la columna nullable sin default; la migración 0019 aplica limpio sobre una base con 0018; `NULL` en filas preexistentes; el repo persiste y lee el motivo.

## Verificación

- `pnpm db:check` en verde; `pnpm --filter @workspace/database typecheck`.
- Manual: `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'subscription';` muestra `end_date_override_reason | YES | NULL`.
