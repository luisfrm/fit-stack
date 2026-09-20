# Fase 6 — Docs y verificación global

> Requiere: fase-0…5 (todo el código). Commit: `docs: AGENTS.md (compensation rule + period contract + 0019 column), endpoint README, adjusted PENDING`.

## Objetivo

Dejar la regla escrita donde el próximo agente la encuentre y correr la matriz de verificación completa de `task.md` antes de pedir review. Cuando haya duda, actualizar `AGENTS.md`.

## Modificar

| Archivo | Cambio |
|---|---|
| `AGENTS.md` | Nueva regla de compensación (helper por relectura, `committed` = éxito + barrido, `voided` con motivo fijo, huérfana con `cancel`, periodo SaaS no revertido, sin transacciones interactivas) + contrato del periodo servidor (`startDate?`/`endDate?`/`endDateOverrideReason?`, 422 por código, vigencia a día local) + columna 0019 en el esquema (33→34 tablas si aplica el conteo, o nota aditiva). |
| README del endpoint en `apps/api-worker` | Documentar el body de `POST /api/subscriptions` (opcionales, defaults, guards y códigos). Si no existe README del worker, sección equivalente donde vivan los contratos de endpoint. |
| `vaults/backlog/pagos-suscripciones.md` §1 | Ajustar el ítem "create() no es atómico": cerrado por compensación explícita (referenciar [[FS-0002]]); mantener abierto el sub-ítem de cascada por borrado de miembro (baja lógica vs 409, con su disparador). |

## No tocar

- `task.md` (requerimiento; si el _qué_ cambió, enmienda anotada, no reescritura).
- Código de producto: esta fase solo mueve docs y verificaciones. Hallazgo de código = fix en su fase, no aquí.

## Detalle

1. `AGENTS.md`: regla junto a "No interactive transactions (serverless)" y al bloque de recibos si aplica; contrato del periodo junto a la Regla 4 / tabla de rutas `/api/subscriptions`; columna en el esquema de DB.
2. Backlog: marcar lo resuelto con enlace a la task; no borrar el contexto de los ítems abiertos (§2 DELETE SaaS, §3 `refunded`, §4 doble periodo histórico — fuera de alcance declarado).
3. Matriz de verificación (en orden): `pnpm typecheck` (9/9) · `pnpm lint` (0 errores) · unitarios shared/panel/console/jobs-worker · integración `subscriptions`, `subscriptions-compensation`, `platform-subscriptions-compensation`, `subscriptions-period`, `receipts-*`, `platform-receipts-*`, `dashboard`, `members-stats`, `org-billing` · E2E del flujo de renovación del panel (`pnpm test:e2e:panel` o el spec correspondiente).

## Criterio de done

- Docs actualizados y PENDING sin el ítem de atomicidad como abierto; matriz en verde (o fallos preexistentes documentados como tales, fuera de alcance).

## Verificación

- `pnpm typecheck && pnpm lint && pnpm test` + suites de integración listadas + E2E de renovación; `pnpm db:check`.
