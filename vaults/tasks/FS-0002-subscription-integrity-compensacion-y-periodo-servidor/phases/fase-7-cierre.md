# Fase 7 — Cierre (post-implementación)

> Requiere: fases 0–5 **implementadas** y sin commitear en `fix/subscription-integrity` (recreada desde `26dcdf0`, merge de [[FS-0004]]). Esta fase **no re-planifica**: cierra. El commit/PR es del **usuario** (nunca auto-commit). Resumen en `../plan.md` §"Cierre (post-implementación)".

## Objetivo

Dejar la rama verificable y lista para PR: arreglar el único test rojo, corregir la deriva de docs («el periodo SaaS **sí** se revierte» + ruta muerta `docs/PENDING.md`), documentar los contratos nuevos, correr la matriz de verificación completa y cerrar la task administrativamente.

## Estado de partida (verificado)

- `git status`: **16 modificados + 9 nuevos = 25 archivos** sin commitear.
- `pnpm typecheck` ya verde.
- **1 test rojo**: `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts`, caso `(d) validar un pago de una suscripción cancelada` (~línea 337) → 404 `Pago no encontrado`.

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts` | Único cambio de código: inducir la cancelación con `POST /:id/cancel` (no con `DELETE`). |
| `phases/README.md`, `phases/fase-6-docs-cierre.md`, `phases/fase-3-compensacion-saas.md`, `plan.md`, `task.md` | Deriva de docs (periodo revertido + ruta `PENDING`). |
| `apps/api-worker/README.md`, `AGENTS.md` | Documentar contratos nuevos. |
| `task.md` | Cierre administrativo (checkboxes + `status: done` + `pr`). |

## No tocar

- Código de producto de fases 0–5 (ya implementado); C1 es la **única** excepción.
- Migración `packages/database/migrations/0019_woozy_whiplash.sql`: **no** aplicar a mano (`pnpm db:migrate` prohibido); la aplica CI (`database-migrations.yml`) al merge.
- No commitear ni abrir PR: eso lo hace el usuario.

---

## C1 — Arreglar el test rojo

**Causa**: el caso `(d)` cancela con `DELETE /api/platform/subscriptions/:id` (borrado duro; la FK se lleva el pago) y luego hace `PATCH` del pago → 404 `Pago no encontrado`. La inducción correcta no borra: `POST /api/platform/subscriptions/:id/cancel` (ruta `apps/api-worker/src/routes/platform-subscriptions.route.ts:277`; `cancelSchema = z.object({ reason: z.string().optional() })` línea 63; servicio `cancelSubscription` línea 555) fija `cancelledAt` **sin borrar**.

**Archivo**: `apps/api-worker/tests/integration/platform-subscriptions-compensation.test.ts`, líneas ~355-356.

Antes:

```ts
const cancel = await admin.client.delete(`/api/platform/subscriptions/${subId}`);
expect(cancel.status, cancel.text).toBe(200);
```

Después:

```ts
const cancel = await admin.client.post(`/api/platform/subscriptions/${subId}/cancel`, {
  reason: 'Cancelación de prueba (d)',
});
expect(cancel.status, cancel.text).toBe(200);
```

**Comando**: `pnpm --filter api-worker test -- tests/integration/platform-subscriptions-compensation.test.ts`

**Resultado esperado**: `POST /cancel` → 200 (`{ success: true, id }`); la suscripción queda con `cancelled_at` no nulo y el pago `processing` sobrevive; el `PATCH … { status: 'validated' }` posterior → **409 `{ code: 'SUBSCRIPTION_CANCELLED' }`** (servicio `platform-subscriptions.service.ts:633`); el pago sigue `processing` con `receipt_number` null; `expectNoValidChargeWithoutReceipt` pasa. Suite 4/4.

---

## C2 — Corregir deriva de docs

Ratificar como **enmienda anotada** (no reescribir historia); el spec manda reversión del periodo y `phases/fase-3-compensacion-saas.md` es la referencia.

| Archivo | Línea | Sustituir |
|---|---|---|
| `phases/README.md` | 28 | `periodo SaaS movido no se revierte` → `periodo SaaS extendido se revierte al valor previo (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender)` |
| `phases/fase-6-docs-cierre.md` | 13 | `periodo SaaS no revertido` → `periodo SaaS revertido al valor previo (`revertEffect`)` |
| `plan.md` | 58 | `resto → solo void del pago, periodo intacto y documentado` → `resto → void del pago + reversión del periodo extendido (`revertEffect` → `updatePeriodEnd(previousPeriodEnd)`, leído antes de extender)` |
| `phases/fase-3-compensacion-saas.md` | 39 | `pago voided, periodo y suscripción sin revertir, reintento limpio` → `pago voided, periodo revertido al valor previo, reintento limpio` (hallazgo: contradice el encabezado de la propia fase-3) |
| `task.md` | 74 | `docs/PENDING.md §5.2` → `vaults/backlog/pagos-suscripciones.md` (ruta movida por [[FS-0004]]) |

> `plan.md:16` («Decisiones congeladas») **ya está alineada** (`periodo revertido`): no tocar. `task.md` es el requerimiento: la corrección de ruta es factual, no cambia el _qué_.

**Comando**: revisión manual (`git diff --` de cada archivo); no hay test para docs.

**Resultado esperado**: ninguna mención a «periodo no revertido»/`docs/PENDING.md` en la carpeta de la task.

---

## C3 — Documentar contratos nuevos

Contratos presentes en el código que el spec no recogía; documentar sin inventar (referencias reales).

| Contrato | Forma | Evidencia |
|---|---|---|
| Re-validar pago no-`processing` | 409 `{ code: 'PAYMENT_NOT_REVALIDATABLE' }` | `platform-subscriptions.service.ts:611` |
| Validar pago de suscripción cancelada | 409 `{ code: 'SUBSCRIPTION_CANCELLED' }` (el pago queda `processing`) | `platform-subscriptions.service.ts:633` |
| `END_DATE_BEFORE_START` | compara **días locales** de la tz de la org, no instantes | `subscriptions.service.ts:239` |
| Alta SaaS con pago creado-pero-anulado | anula el pago **y cancela la suscripción** (`cancel()`); un `voided` se ignora en `computePlatformSubscriptionStatus` | `platform-subscriptions.service.ts` (alta) / `computePlatformSubscriptionStatus` |

**Ediciones**:

1. `apps/api-worker/README.md`
   - Sección `POST /api/subscriptions` (guards): aclarar que la comparación es a **día local**.
   - Tabla de rutas plataforma: añadir/annotar `PATCH /api/platform/subscriptions/payments/:id/status` con los dos `409` por código (`PAYMENT_NOT_REVALIDATABLE`, `SUBSCRIPTION_CANCELLED`).
   - Párrafo de compensación (línea 189): añadir el caso SaaS alta-con-pago-anulado y la reversión del periodo.
2. `AGENTS.md`
   - Bullet de compensación (línea 169): ya recoge la reversión y «cannot be re-validated». **Verificar y, si falta, completar** con los nombres de código y el caso alta-con-pago-anulado.

**Comando**: `pnpm lint` (los `.md` no rompen lint; verificación de contenido manual).

**Resultado esperado**: los cuatro contratos aparecen en README/AGENTS.md con su código exacto.

---

## C4 — Verificación global

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `pnpm typecheck` | 9/9 tareas OK |
| 2 | `pnpm lint` | 0 errores |
| 3 | `pnpm test` | unit shared/api-worker/jobs-worker/panel/console + integración api-worker (rama Neon vía `TEST_DATABASE_URL`; sin ella se salta con `describe.skipIf`) |
| 4 | integración por archivo (abajo) | todas verdes |
| 5 | `pnpm db:check` | esquema consistente (0019 pendiente de CI, sin drift) |

**Caveat del filtro**: `pnpm --filter api-worker test -- <filtro>` trata cada argumento posicional como **substring** y los OR-ea; un filtro parcial ejecuta varios archivos a la vez. Correr **un archivo por comando con ruta completa**:

```
pnpm --filter api-worker test -- tests/integration/subscriptions.test.ts
pnpm --filter api-worker test -- tests/integration/subscriptions-compensation.test.ts
pnpm --filter api-worker test -- tests/integration/platform-subscriptions-compensation.test.ts
pnpm --filter api-worker test -- tests/integration/subscriptions-period.test.ts
pnpm --filter api-worker test -- tests/integration/platform-subscription-status.test.ts
pnpm --filter api-worker test -- tests/integration/dashboard.test.ts
pnpm --filter api-worker test -- tests/integration/members-stats.test.ts
pnpm --filter api-worker test -- tests/integration/org-billing.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-emission.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-sequence.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-snapshot.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-voided-pdf.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-integrity.test.ts
pnpm --filter api-worker test -- tests/integration/receipts-rbac.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-emission.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-sequence.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-snapshot.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-void.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-report.test.ts
pnpm --filter api-worker test -- tests/integration/platform-receipts-contract.test.ts
```

---

## C5 — E2E de renovación del panel

1. Comprobar env (hoy **ambos existen**): `Test-Path apps/panel/.env` · `Test-Path apps/console/.env`.
2. Presentes → `pnpm test:e2e:panel` (spec `e2e/panel/subscriptions.spec.ts`, flujo de renovación).
3. Ausente alguno → registrar **infra-bloqueado** (no es fallo de la task).

**Resultado esperado**: E2E de renovación en verde; o reporte explícito de bloqueo con la comprobación de env.

---

## C6 — Cierre administrativo

- `task.md`: marcar los checkboxes B3.1/B3.2/B3.3 + «Verificación global»; frontmatter `status: in_progress` → `done`; `pr: null` se rellena cuando el usuario abra el PR.
- Commits en el **orden de 7 ya sugerido en `task.md`** (mapea los 25 archivos: DB 0019 → shared periodo → helper+gym → SaaS → periodo servidor → panel → docs). **No auto-commit**: el usuario revisa y commitea.
- Migración **0019**: no aplicar a mano; CI la aplica al merge.

## Criterio de done

- C1 aplicado → `platform-subscriptions-compensation.test.ts` 4/4.
- C2 y C3 aplicados (docs sin deriva, contratos documentados).
- C4 en verde (o fallos preexistentes documentados como tales).
- C5 ejecutado o reportado como infra-bloqueado.
- `task.md` cerrada (`status: done`) y PR abierto por el usuario.

## Verificación

`pnpm typecheck && pnpm lint && pnpm test` + las 20 suites de integración listadas (una por comando) + `pnpm db:check` + `pnpm test:e2e:panel` (si hay `.env`).
