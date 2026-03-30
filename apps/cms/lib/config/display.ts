/**
 * Display configuration for the CMS.
 *
 * These values are currently hardcoded but designed to be replaced
 * with gym settings fetched from the database in the future.
 */

// ─── Timezone ──────────────────────────────────────────────────
/** IANA timezone identifier used across the CMS for display and calculations. */
export const DEFAULT_TIMEZONE = 'America/Caracas' as const;
/** UTC Offset equivalent for the default timezone to create stable Dates natively in JS */
export const DEFAULT_TIMEZONE_OFFSET = '-04:00' as const;

// ─── Time Format ───────────────────────────────────────────────
/** '12h' renders as  "8:30 AM"  | '24h' renders as  "08:30" */
export type TimeFormat = '12h' | '24h';
export const DEFAULT_TIME_FORMAT: TimeFormat = '12h';

// ─── Utility ───────────────────────────────────────────────────
/**
 * Formats a stored HH:MM string for display.
 *
 * @param time   — stored value, e.g. "08:30" or "22:00"
 * @param format — '12h' (default) or '24h'
 * @returns formatted string, e.g. "8:30 AM" or "08:30"
 *
 * Note: times in the DB are always 24-h (00:00–23:59). This utility
 * handles the presentation layer only and is timezone-agnostic for
 * wall-clock display. Timezone handling (America/Caracas) will matter
 * when comparing times to "now" — add that logic here when needed.
 */
export function formatTime(time: string, format: TimeFormat = DEFAULT_TIME_FORMAT): string {
  const [hStr, mStr] = time.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  const mm = String(m).padStart(2, '0');

  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${mm}`;
  }

  // 12-hour AM/PM
  const period = h < 12 ? 'AM' : 'PM';
  const h12   = h % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Formats a time range from two HH:MM strings.
 * e.g. "8:30 AM – 9:30 AM" or "08:30 – 09:30"
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

/**
 * Creates a stable Date object directly targeting midnight in the default timezone
 * to prevent off-by-one day bugs with basic "YYYY-MM-DD" inputs.
 * @param dateStr "YYYY-MM-DD"
 */
export function parseDateAsConfigTimezone(dateStr: string): Date {
  // Ej: "2026-03-30T00:00:00-04:00" -> creates a local JS Date matching exactly that UTC point
  return new Date(`${dateStr}T00:00:00${DEFAULT_TIMEZONE_OFFSET}`);
}
