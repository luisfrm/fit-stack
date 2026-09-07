import { TZDate, tzOffset } from '@date-fns/tz';
import { addDays, addMonths, addWeeks, addYears } from 'date-fns';

/**
 * Utilidades de fecha/zona horaria para Fit-Stack.
 *
 * Fuente única de verdad para convertir entre fechas UTC (lo que se guarda en la BD,
 * columnas `timestamptz`) y el día local de una organización (IANA, ej. `America/Caracas`).
 *
 * Regla de negocio clave: un pago registrado a las 11pm en Venezuela debe caer en el
 * MISMO día local en reportes/ingresos del día. Por eso nunca se usa la tz del servidor:
 * siempre se opera con una `TZDate` anclada a la tz de la organización.
 *
 * ⚠️ La agregación por día/mes local en reportes se hace en SQL (`AT TIME ZONE`).
 * Estas funciones resuelven la ENTRADA (límites de día local como instantes UTC para los
 * `WHERE gte/lte`) y el DISPLAY; no reemplazan la agregación de Postgres.
 */

export type DurationUnit = 'day' | 'week' | 'month' | 'year';

/** Timezone por defecto de la plataforma (Venezuela). */
export const DEFAULT_TIMEZONE = 'America/Caracas' as const;

/**
 * Devuelve una tz IANA válida, con fallback al default de la plataforma.
 * @param tz tz IANA (ej. "America/Caracas") o null/undefined.
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
 * Crea una `TZDate` anclada a la tz indicada, en el instante dado
 * (omitiendo `date` se obtiene "ahora" en esa tz).
 */
function toTzDate(tz: string, date?: Date | string | number): TZDate {
  if (date === undefined) return TZDate.tz(tz);
  if (typeof date === 'string') return new TZDate(date, tz as never);
  if (typeof date === 'number') return new TZDate(date, tz as never);
  return new TZDate(date.getTime(), tz as never);
}

/**
 * Crea una `TZDate` en el instante de MEDIANOCHE LOCAL del día `dateStr` ('YYYY-MM-DD').
 */
function localMidnightTz(tz: string, dateStr: string): TZDate {
  const [year, month, day] = dateStr.split('-').map((p) => Number(p));
  return new TZDate(year ?? 0, (month ?? 1) - 1, day ?? 1, tz as never);
}

/**
 * Parsea un 'YYYY-MM-DD' local y devuelve el instante UTC de medianoche local.
 * Ej: parseLocalToUtc('America/Caracas', '2026-01-01') → Date UTC del 2026-01-01T04:00:00Z.
 */
export function parseLocalToUtc(tz: string | null | undefined, dateStr: string): Date {
  const timezone = resolveOrgTimezone(tz);
  return new Date(localMidnightTz(timezone, dateStr).getTime());
}

/**
 * Devuelve el día local ('YYYY-MM-DD') de `date` en la tz indicada.
 * Ej: toLocalDayString('America/Caracas', new Date('2026-01-02T03:00:00Z')) → '2026-01-01'
 *     (a las 11pm del 1ro en Caracas sigue siendo el día 1).
 */
export function toLocalDayString(tz?: string | null, date: Date | string | number = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const d = toTzDate(timezone, date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Devuelve el mes local ('YYYY-MM') de `date` en la tz indicada.
 */
export function toLocalMonthString(tz?: string | null, date: Date | string | number = new Date()): string {
  const timezone = resolveOrgTimezone(tz);
  const d = toTzDate(timezone, date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * Instante UTC del inicio del día local (00:00:00.000).
 * Sin `dateStr`, usa el día local de "ahora".
 */
export function localDayStartUtc(tz?: string | null, dateStr?: string): Date {
  const timezone = resolveOrgTimezone(tz);
  const base = dateStr ? localMidnightTz(timezone, dateStr) : TZDate.tz(timezone);
  const start = new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), timezone as never);
  return new Date(start.getTime());
}

/**
 * Instante UTC del fin del día local (23:59:59.999).
 * Sin `dateStr`, usa el día local de "ahora".
 */
export function localDayEndUtc(tz?: string | null, dateStr?: string): Date {
  const timezone = resolveOrgTimezone(tz);
  const base = dateStr ? localMidnightTz(timezone, dateStr) : TZDate.tz(timezone);
  const nextDay = new TZDate(base.getFullYear(), base.getMonth(), base.getDate() + 1, timezone as never);
  return new Date(nextDay.getTime() - 1);
}

/**
 * Rango completo del día local como instantes UTC: `{ start, end }`.
 * Útil para los `WHERE gte(start) / lte(end)` de pagos del día.
 */
export function localDayRange(tz?: string | null, dateStr?: string): { start: Date; end: Date } {
  return { start: localDayStartUtc(tz, dateStr), end: localDayEndUtc(tz, dateStr) };
}

/**
 * Instante UTC del inicio del mes local ('YYYY-MM-01T00:00:00').
 * `monthsAgo` permite retroceder N meses (0 = mes actual).
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
 * Alias de `parseLocalToUtc` para compatibilidad con el antiguo helper de `display.ts`.
 * Crea un `Date` estable apuntando a la medianoche del día en la tz de la org
 * (evita el off-by-one día con inputs 'YYYY-MM-DD').
 */
export function parseDateAsConfigTimezone(dateStr: string, timezone?: string | null): Date {
  return parseLocalToUtc(timezone, dateStr);
}

/**
 * Suma una duración a una fecha, operando en la tz indicada (evita saltos de día por DST).
 * Devuelve el instante UTC resultante como `Date`. Para obtener la fecha local usar
 * `toLocalDayString(tz, addDuration(...))`.
 */
export function addDuration(
  base: Date,
  value: number,
  unit: DurationUnit,
  timezone?: string | null,
): Date {
  const tz = resolveOrgTimezone(timezone);
  const tzDate = new TZDate(base.getTime(), tz as never);
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
 * Offset de la tz en formato '+hh:mm' (ej. '+05:30' para Asia/Kolkata, '-04:00' para Caracas).
 * Reemplaza el parser manual de `Intl.DateTimeFormat(...).timeZoneName` de `display.ts`.
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

// (Se eliminó `daysBetween`: usaba la aproximación Math.floor(ms/86_400_000), sensible a DST.
//  Para "días restantes" tz-aware usar localDayRange/toLocalDayString.)
