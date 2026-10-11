import { addDuration, localDayStartUtc, toLocalDayString, type DurationUnit } from './date';

/**
 * Cumulative subscription period input (Rule 4: no paid day is lost).
 *
 * `Date` instances are already resolved (UTC instants); the function does not parse strings.
 * `timezone` is mandatory without silent fallback: missing tz is a visible error.
 */
export interface ComputeSubscriptionPeriodInput {
  startDate: Date;
  /** `latest.endDate` or null if there is no active period. */
  latestEndDate?: Date | null;
  durationValue: number;
  durationUnit: DurationUnit;
  /** Organization IANA timezone (e.g. 'America/Caracas'). Mandatory. */
  timezone: string;
  /** Injectable for tests (defaults to new Date()). */
  now?: Date;
}

export interface ComputeSubscriptionPeriodResult {
  startDate: Date;
  endDate: Date;
  baseline: Date;
  /** true if baseline = latestEndDate (renewal was cumulative). */
  accumulated: boolean;
  hasActivePeriod: boolean;
}

/**
 * Single rule for cumulative subscription periods, shared between server and panel.
 *
 * 1. `hasActivePeriod` = active by local day (period expiring today remains
 *    active today), not by instant.
 * 2. `baseline` = `max(latestEndDate, startDate)` if active period exists;
 *    `startDate` otherwise (expired periods or future `startDate` do not accumulate).
 * 3. `endDate` = tz-aware addition via `addDuration` (never manual arithmetic).
 * 4. Pure: does not validate reason or ranges (HTTP boundary responsibility).
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
  // `accumulated` is derived from the SAME condition choosing baseline: only
  // accumulates if active period exists AND its end is strictly after start.
  // When `latestEndDate === startDate` it does not accumulate (baseline = startDate).
  const accumulates =
    hasActivePeriod &&
    latestEndDate != null &&
    latestEndDate.getTime() > startDate.getTime();
  const baseline = accumulates && latestEndDate != null ? latestEndDate : startDate;
  const endDate = addDuration(baseline, durationValue, durationUnit, timezone);
  return { startDate, endDate, baseline, accumulated: accumulates, hasActivePeriod };
}
