# Fase 4 — B3.3: el periodo lo calcula el servidor (solo `POST /api/subscriptions`)

> Requiere: fase-0 (columna del motivo) + fase-1 (`computeSubscriptionPeriod`). Commit: `feat(api-worker): the gym subscription period is authoritative on the server — validation, computation, persistence + tests`.

## Objetivo

Que `POST /api/subscriptions` sea autoritativo en el periodo acumulativo: cualquier consumidor (panel, API directa, E2E, portal, app futura) obtiene la misma Regla 4. `startDate`/`endDate` pasan a opcionales; el `endDate` explícito solo exige motivo si acorta un periodo vigente; `endDate < startDate` se rechaza. Solo este endpoint: `PUT /:id` (active/cancelled) y `PATCH /payments/:id/status` no tocan fechas.

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/routes/subscriptions.route.ts` | `createSubSchema`: `startDate` opcional, `endDate` opcional, `endDateOverrideReason: z.string().optional()` (el `trim().length > 0` se exige en el servicio, no en zod, para devolver el código 422 propio). Resto del schema intacto (dinero en centavos `z.number().int()`, `paymentMethodDetailsSchema`, impuestos). |
| `apps/api-worker/src/services/subscriptions.service.ts` | `create()`: resuelve fechas con el helper de fase-1, aplica guards por código y persiste `endDateOverrideReason`. |
| `apps/api-worker/tests/integration/subscriptions-period.test.ts` | Nueva suite con los 6 tests. |

## No tocar

- `PUT /api/subscriptions/:id`, `PATCH /api/payments/:id/status`, rutas SaaS (Console ya es autoritativo), `findLatestForMember` (ya excluye anuladas/canceladas; el baseline no re-filtra).
- `updatePaymentStatus` → `validated` no re-calcula periodo: el periodo nace en el alta (B3.3 no mueve la extensión por validación tardía de `processing`).

## Detalle

Flujo en `create()` (tz = la ya inyectada por `requireOrgTimezone()`, sin default silencioso):

1. Resolver `startDate`: si no viene → hoy local (`toLocalDayString(tz)` → `parseLocalToUtc`); `'YYYY-MM-DD'` → `dateManager.parseLocalToUtc`; ISO con `T` → `new Date()`. Igual que hoy, pero opcional.
2. Cargar `plan` (dura­ción para el cálculo) y `latest` (`findLatestForMember`, ya filtrado). Guard `processing` existente intacto y primero.
3. `computed = computeSubscriptionPeriod({ startDate, latestEndDate: latest?.endDate ?? null, durationValue: plan.durationValue, durationUnit: plan.durationUnit, timezone })`.
4. Si el body trae `endDate`: parsearlo igual que `startDate`; `endDate < startDate` → `422 { code: 'END_DATE_BEFORE_START' }`; si `computed.hasActivePeriod && endDate < computed.endDate` (comparación a día local con `toLocalDayString`) → exigir `endDateOverrideReason?.trim()`: vacío/ausente → `422 { code: 'END_DATE_OVERRIDE_REASON_REQUIRED' }`; con motivo → usar el `endDate` explícito y persistirlo. Si `endDate` ≥ calculado (idempotente, incluye igualdad) o no hay periodo vigente (periodo nuevo a medida, legítimo) → aceptar libre, motivo `NULL`.
5. Sin `endDate` → `endDate = computed.endDate`, motivo `NULL`.
6. Persistir la suscripción con `endDateOverrideReason` (columna 0019) y seguir con pago + emisión + compensación de fase-2 sin cambios.

Errores con `HTTPException` y `res` propio (`c.json({ error, code }, 422)`), mismo patrón que `409 { code: 'SLUG_TAKEN' }`: el `code` es el contrato que el panel mapea en fase-5. Nunca texto libre como contrato.

Compatibilidad: quien hoy manda `endDate` de periodo nuevo (12 suites, `e2e/seed.ts`, specs E2E) sigue en 201 sin cambios — entra por la rama "sin periodo vigente" o "igual al calculado".

## Criterio de done

- Tests de integración (6): (a) sin fechas → periodo = inicio + duración (mensual, semanal y diaria en sub-casos); (b) renovación sobre vigente → acumula desde `latest.endDate` aunque `startDate` sea hoy; (c) periodo vencido → `baseline = startDate` (no acumula); (d) `endDate` que acorta sin motivo → 422 con `code`; (e) con motivo → 201 y motivo persistido (relectura del repo); (f) `endDate < startDate` → 422 con `code`.
- Revisar (no dar por buenos): los acumulativos de `subscriptions.test.ts` que codifican el cálculo del cliente y el E2E de renovación del panel — actualizar solo lo que contradiga al servidor.

## Verificación

- `pnpm --filter api-worker test:integration -- subscriptions-period` + regresión `subscriptions`, `receipts-*`, `dashboard`, `members-stats`; `pnpm typecheck`; `pnpm lint`.
