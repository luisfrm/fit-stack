import { TZDate, tzOffset } from '@date-fns/tz';
import { addDays, addMonths, addWeeks, addYears } from 'date-fns';

/**
 * Date and timezone utilities for Fit-Stack.
 *
 * Single source of truth for converting between UTC dates (persisted in DB,
 * `timestamptz` columns) and an organization's local day (IANA, e.g. `America/Caracas`).
 *
 * Core business rule: a payment registered at 11pm in Venezuela must fall on the
 * SAME local day in daily revenue and reports. This is why the server timezone is
 * never used: operations are always executed with a `TZDate` pinned to the organization's tz.
 *
 * ⚠️ Local day/month aggregations in reports are done in SQL (`AT TIME ZONE`).
 * These functions resolve INPUT boundaries (local day limits as UTC instants for
 * `WHERE gte/lte`) and DISPLAY; they do not replace Postgres aggregation.
 */

export type DurationUnit = 'day' | 'week' | 'month' | 'year';

/** Default platform timezone (Venezuela). */
export const DEFAULT_TIMEZONE = 'America/Caracas' as const;

/**
 * Returns a valid IANA timezone, falling back to the platform default.
 * @param tz IANA tz (e.g. "America/Caracas") or null/undefined.
 */
export function resolveOrgTimezone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE;
  const trimmed = tz.trim();
  return trimmed || DEFAULT_TIMEZONE;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Creates a `TZDate` pinned to the specified timezone at the given instant
 * (omitting `date` returns "now" in that timezone).
 */
function toTzDate(tz: string, date?: Date | string | number): TZDate {
  if (date === undefined) return TZDate.tz(tz);
  if (typeof date === 'string') return new TZDate(date, tz as never);
  if (typeof date === 'number') return new TZDate(date, tz as never);
  return new TZDate(date.getTime(), tz as never);
}

/**
 * Creates a `TZDate` at the instant of LOCAL MIDNIGHT for the day `dateStr` ('YYYY-MM-DD').
 */
function localMidnightTz(tz: string, dateStr: string): TZDate {
  const [year, month, day] = dateStr.split('-').map((p) => Number(p));
  return new TZDate(year ?? 0, (month ?? 1) - 1, day ?? 1, tz as never);
}

/**
 * Parses a local 'YYYY-MM-DD' and returns the UTC instant corresponding to local midnight.
 * Example: parseLocalToUtc('America/Caracas', '2026-01-01') → UTC Date for 2026-01-01T04:00:00Z.
 */
export function parseLocalToUtc(tz: string | null | undefined, dateStr: string): Date {
  const timezone = resolveOrgTimezone(tz);
  return new Date(localMidnightTz(timezone, dateStr).getTime());
}

/**
 * Returns the local day ('YYYY-MM-DD') of `date` in the specified timezone.
 * Example: toLocalDayString('America/Caracas', new Date('2026-01-02T03:00:00Z')) → '2026-01-01'
 *     (at 11pm on the 1st in Caracas it is still the 1st).
 */
export function toLocalDayString(tz?: string | null, date: Date | string | number = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const d = toTzDate(timezone, date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns the local month ('YYYY-MM') of `date` in the specified timezone.
 */
export function toLocalMonthString(tz?: string | null, date: Date | string | number = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const d = toTzDate(timezone, date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * UTC instant of local day start (00:00:00.000).
 * Without `dateStr`, defaults to the local day of "now".
 */
export function localDayStartUtc(tz?: string | null, dateStr?: string): Date {
  const timezone = resolveOrgTimezone(tz);
  const base = dateStr ? localMidnightTz(timezone, dateStr) : TZDate.tz(timezone);
  const start = new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), timezone as never);
  return new Date(start.getTime());
}

/**
 * UTC instant of local day end (23:59:59.999).
 * Without `dateStr`, defaults to the local day of "now".
 */
export function localDayEndUtc(tz?: string | null, dateStr?: string): Date {
  const timezone = resolveOrgTimezone(tz);
  const base = dateStr ? localMidnightTz(timezone, dateStr) : TZDate.tz(timezone);
  const nextDay = new TZDate(base.getFullYear(), base.getMonth(), base.getDate() + 1, timezone as never);
  return new Date(nextDay.getTime() - 1);
}

/**
 * Full local day range as UTC instants: `{ start, end }`.
 * Useful for `WHERE gte(start) / lte(end)` filters on daily payments.
 */
export function localDayRange(tz?: string | null, dateStr?: string): { start: Date; end: Date } {
  return { start: localDayStartUtc(tz, dateStr), end: localDayEndUtc(tz, dateStr) };
}

/**
 * UTC instant of local month start ('YYYY-MM-01T00:00:00').
 * `monthsAgo` allows stepping back N months (0 = current month).
 */
export function localMonthStartUtc(tz?: string | null, monthsAgo: number = 0): Date {
  const timezone = resolveOrgTimezone(tz);
  const now = TZDate.tz(timezone);
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based
  month -= monthsAgo;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  const start = new TZDate(year, month, 1, timezone as never);
  return new Date(start.getTime());
}

/**
 * Local day of the week (0=Sun … 6=Sat) for 'YYYY-MM-DD' in the given timezone.
 * TZ-aware (via TZDate): does not use server timezone or manual arithmetic.
 */
export function localWeekday(tz: string | null | undefined, dateStr?: string): number {
  const timezone = resolveOrgTimezone(tz);
  const base = dateStr ? localMidnightTz(timezone, dateStr) : TZDate.tz(timezone);
  return base.getDay();
}

/**
 * Local time 'HH:MM' (24 h) of the instant in the given timezone.
 * Useful for lexicographical range comparisons of `startTime/endTime`.
 */
export function localTimeString(tz: string | null | undefined, date: Date | string | number = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const d = toTzDate(timezone, date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Adds N calendar days to a local 'YYYY-MM-DD' and returns 'YYYY-MM-DD'.
 * Operates in the indicated timezone (avoids DST day-shift issues).
 */
export function addLocalDays(tz: string | null | undefined, dateStr: string, days: number): string {
  const timezone = resolveOrgTimezone(tz);
  const base = localMidnightTz(timezone, dateStr);
  return toLocalDayString(timezone, addDays(base, days));
}

/**
 * Alias of `parseLocalToUtc` for compatibility with former `display.ts` helper.
 * Creates a stable `Date` pointing to midnight of the day in the org timezone
 * (avoids off-by-one day bugs with 'YYYY-MM-DD' inputs).
 */
export function parseDateAsConfigTimezone(dateStr: string, timezone?: string | null): Date {
  return parseLocalToUtc(timezone, dateStr);
}

/**
 * Adds duration to a date, operating in the indicated timezone (avoids DST day-shifts).
 * Returns the resulting UTC instant as a `Date`. To obtain the local date, use
 * `toLocalDayString(tz, addDuration(...))`.
 */
export function addDuration(
  base: Date,
  value: number,
  unit: DurationUnit,
  timezone: string,
): Date {
  // Explicit REQUIRED timezone: no silent fallback to `America/Caracas` (§10).
  // `'UTC'` is a valid value — what is not permitted is omitting it and having
  // a fallback silently decide.
  if (!timezone?.trim()) {
    throw new Error(
      'addDuration: timezone es obligatoria (usa "UTC" para billing de plataforma).',
    );
  }
  const tzDate = new TZDate(base.getTime(), timezone as never);
  let result: Date = tzDate;
  switch (unit) {
    case 'day':
      result = addDays(tzDate, value);
      break;
    case 'week':
      result = addWeeks(tzDate, value);
      break;
    case 'month':
      result = addMonths(tzDate, value);
      break;
    case 'year':
      result = addYears(tzDate, value);
      break;
  }
  return new Date(result.getTime());
}

/**
 * Timezone offset in '+hh:mm' format (e.g. '+05:30' for Asia/Kolkata, '-04:00' for Caracas).
 * Replaces manual parser of `Intl.DateTimeFormat(...).timeZoneName`.
 */
export function getTimezoneOffset(tz?: string | null, date: Date = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const minutes = tzOffset(timezone, date);
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

// (`daysBetween` was removed: it used the DST-sensitive approximation Math.floor(ms/86_400_000).
//  For tz-aware remaining days, use localDayRange/toLocalDayString.)

// ── Wall-clock time formatting ──────────────────────────────────────────────

/**
 * Display format for an organization's wall-clock times.
 * `12h` renders as "8:30 AM"; `24h` renders as "08:30".
 */
export type TimeFormat = '12h' | '24h';

/** Default display format when the organization has no explicit preference. */
export const DEFAULT_TIME_FORMAT: TimeFormat = '12h';

/**
 * Formats a stored `HH:MM` string for display.
 *
 * Stored values are ALWAYS 24-h (`00:00`–`23:59`); this helper only handles
 * the presentation layer and is timezone-agnostic: it never shifts the value.
 *
 * @param time   Stored value, e.g. "08:30" or "22:00".
 * @param format `12h` (default) or `24h`.
 * @returns Formatted string, e.g. "8:30 AM" or "08:30".
 */
export function formatTime(
  time: string,
  format: TimeFormat = DEFAULT_TIME_FORMAT,
): string {
  const [hStr, mStr] = time.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  const mm = String(m).padStart(2, '0');

  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${mm}`;
  }

  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Formats a time range from two `HH:MM` strings.
 * e.g. "8:30 AM – 9:30 AM" or "08:30 – 09:30".
 */
export function formatTimeRange(
  startTime: string,
  endTime?: string | null,
  format: TimeFormat = DEFAULT_TIME_FORMAT,
): string {
  const start = formatTime(startTime, format);
  if (!endTime) return start;
  return `${start} – ${formatTime(endTime, format)}`;
}
