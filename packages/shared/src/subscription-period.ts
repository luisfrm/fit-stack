import { addDuration, localDayStartUtc, toLocalDayString, type DurationUnit } from './date';

/**
 * Entrada de la regla de periodo acumulativo (Regla 4: ningún día pagado se pierde).
 *
 * Los `Date` ya vienen resueltos (instantes UTC); la función no parsea strings.
 * `timezone` es obligatoria y sin fallback silencioso: sin tz es un error visible.
 */
export interface ComputeSubscriptionPeriodInput {
  startDate: Date;
  /** `latest.endDate` o null si no hay periodo vigente. */
  latestEndDate?: Date | null;
  durationValue: number;
  durationUnit: DurationUnit;
  /** IANA de la organización (ej. 'America/Caracas'). Obligatoria. */
  timezone: string;
  /** Inyectable para tests (default new Date()). */
  now?: Date;
}

export interface ComputeSubscriptionPeriodResult {
  startDate: Date;
  endDate: Date;
  baseline: Date;
  /** true si baseline = latestEndDate (la renovación acumuló). */
  accumulated: boolean;
  hasActivePeriod: boolean;
}

/**
 * Una sola regla para el periodo acumulativo, compartida por servidor y panel.
 *
 * 1. `hasActivePeriod` = vigencia a día local (un periodo que vence hoy sigue
 *    vigente hoy), no al instante.
 * 2. `baseline` = `max(latestEndDate, startDate)` si hay periodo vigente;
 *    `startDate` en caso contrario (vencido o `startDate` futuro no acumulan).
 * 3. `endDate` = suma tz-aware vía `addDuration` (nunca aritmética manual).
 * 4. Pura: no valida motivo ni rangos (eso es contrato HTTP, no regla pura).
 */
export function computeSubscriptionPeriod(
  input: ComputeSubscriptionPeriodInput,
): ComputeSubscriptionPeriodResult {
  const { startDate, latestEndDate, durationValue, durationUnit, timezone, now } = input;
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    throw new Error('timezone is required');
  }
  const effectiveNow = now ?? new Date();
  const todayStart = localDayStartUtc(timezone, toLocalDayString(timezone, effectiveNow));
  const hasActivePeriod =
    latestEndDate != null && latestEndDate.getTime() >= todayStart.getTime();
  // `accumulated` sale de la MISMA condición que elige el baseline: solo
  // acumula si hay periodo vigente Y su fin es estrictamente posterior al
  // inicio. Con `latestEndDate === startDate` no se acumula (baseline =
  // startDate) y el flag no debe mentir.
  const accumulates =
    hasActivePeriod &&
    latestEndDate != null &&
    latestEndDate.getTime() > startDate.getTime();
  const baseline = accumulates && latestEndDate != null ? latestEndDate : startDate;
  const endDate = addDuration(baseline, durationValue, durationUnit, timezone);
  return { startDate, endDate, baseline, accumulated: accumulates, hasActivePeriod };
}
