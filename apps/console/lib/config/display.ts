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

// ─── Utility ──────────────────────────────────────────────────
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
 * Helper to get the ISO-style offset (e.g. "+08:00" or "-04:00") for a specific 
 * IANA timezone at a specific date. 
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset'
  }).formatToParts(date);
  
  // The 'timeZoneName' part has a value like "GMT+8" or "GMT-04:00"
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const offset = offsetPart.replace('GMT', '');
  
  // Handle cases like "+8" -> "+08:00"
  if (offset === '') return '+00:00';
  if (!offset.includes(':')) {
    const sign = offset[0];
    const hours = offset.slice(1).padStart(2, '0');
    return `${sign}${hours}:00`;
  }
  return offset;
}

/**
 * Creates a stable Date object directly targeting midnight in the gym's timezone
 * to prevent off-by-one day bugs with basic "YYYY-MM-DD" inputs.
 * @param dateStr "YYYY-MM-DD"
 * @param timezone IANA string (e.g. "Asia/Shanghai")
 */
export function parseDateAsConfigTimezone(dateStr: string, timezone: string = DEFAULT_TIMEZONE): Date {
  const offset = getTimezoneOffset(timezone, new Date(dateStr));
  // Ej: "2026-03-30T00:00:00+08:00" -> creates a local JS Date matching exactly that point in time
  return new Date(`${dateStr}T00:00:00${offset}`);
}