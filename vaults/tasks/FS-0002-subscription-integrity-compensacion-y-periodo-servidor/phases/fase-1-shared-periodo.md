# Fase 1 — Shared: una sola regla para el periodo acumulativo

> Requiere: nada (lógica pura). Bloquea a: fase-4 (cálculo en el servidor) y fase-5 (preview del panel). Commit: `feat(shared): one rule for the cumulative subscription period`.

## Objetivo

Sacar la Regla 4 ("ningún día pagado se pierde") del form del panel y convertirla en una función pura en `@workspace/shared`, consumida por el servidor y por el preview. Tests unitarios sin DB, estilo `packages/shared/tests/date.test.ts`.

## Crear

| Archivo | Contenido |
|---|---|
| `packages/shared/src/subscription-period.ts` | `computeSubscriptionPeriod(input)` pura + tipos. Re-exportada en `packages/shared/src/index.ts`. |
| `packages/shared/tests/subscription-period.test.ts` | Unitarios tabulares (ver criterios). |

## No tocar

- `packages/shared/src/date.ts` (se consume, no se modifica): `addDuration`, `localDayStartUtc`, `toLocalDayString`.
- `apps/api-worker/src/lib/billing-utils.ts` (convención UTC del billing SaaS; no se mezcla con tz de org).

## Detalle

Firma (los `Date` ya vienen resueltos; la función no parsea strings):

```ts
interface ComputeSubscriptionPeriodInput {
  startDate: Date;
  latestEndDate?: Date | null;   // `latest.endDate` o null si no hay vigente
  durationValue: number;
  durationUnit: DurationUnit;    // 'day' | 'week' | 'month' | 'year' (de date.ts)
  timezone: string;              // obligatoria, sin fallback silencioso
  now?: Date;                    // inyectable para tests (default new Date())
}
interface ComputeSubscriptionPeriodResult {
  startDate: Date; endDate: Date; baseline: Date;
  accumulated: boolean;          // true si baseline = latestEndDate
  hasActivePeriod: boolean;
}
```

Regla:

1. `hasActivePeriod = latestEndDate != null && latestEndDate >= localDayStartUtc(timezone, toLocalDayString(timezone, now))` — vigencia a **día local**, no al instante (un periodo que vence hoy sigue vigente hoy).
2. `baseline = hasActivePeriod ? max(latestEndDate, startDate) : startDate` — renovación acumula desde `latest.endDate`; periodo vencido o `startDate` futuro no acumulan.
3. `endDate = addDuration(baseline, durationValue, durationUnit, timezone)` — suma tz-aware (evita saltos por DST; nunca `setUTCMonth` manual).
4. No valida motivo ni rangos: eso es contrato HTTP de fase-4, no regla pura.

## Criterio de done

- Servidor y panel importan la misma función (el form deja de reimplementarla en fase-5); unitarios en verde cubriendo: mensual/semanal/diaria, acumulación desde `latest.endDate`, vencido → `baseline = startDate`, `startDate` futuro sobre vigente → `baseline = startDate`, borde 23:xx (vence hoy = vigente), `latestEndDate` null → periodo nuevo.

## Verificación

- `pnpm --filter @workspace/shared test` (nueva suite); `pnpm typecheck`; prohibido `any` en la firma.
