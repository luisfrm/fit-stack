import { AnyColumn, sql, SQL } from '@workspace/database/factory';
import {
  localDayEndUtc,
  localDayStartUtc,
  localMonthStartUtc,
  parseLocalToUtc as parseLocalToUtcShared,
  toLocalDayString,
} from '@workspace/shared';

/**
 * Contextual class that manages all Date and Timezone logic for a specific organization.
 * Abstracts away PostgreSQL AT TIME ZONE logic and local date parsing.
 *
 * La parte de JS (parseo de fechas locales y límites de día/mes) delega en la util
 * compartida `@workspace/shared` (`date.ts`, basada en `@date-fns/tz`), garantizando
 * que un pago a las 11pm de Venezuela caiga en el mismo día local.
 * La parte SQL (AT TIME ZONE) se mantiene aquí.
 */
export class OrganizationDateManager {
  constructor(public readonly timezone: string) {}

  /**
   * Returns a SQL snippet that shifts a UTC database column to the organization's local timezone.
   */
  toLocalSql(column: AnyColumn | SQL): SQL {
    return sql`${column} AT TIME ZONE 'UTC' AT TIME ZONE ${this.timezone}`;
  }

  /**
   * Returns a SQL snippet that shifts a JavaScript Date value (UTC) to the organization's local timezone.
   */
  toLocalValueSql(date: Date): SQL {
    return sql`${date.toISOString()}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE ${this.timezone}`;
  }

  /**
   * Returns a SQL snippet that formats a date column as a local 'YYYY-MM-DD' string.
   */
  formatDaySql(column: AnyColumn | SQL): SQL<string> {
    return sql<string>`TO_CHAR(${this.toLocalSql(column)}, 'YYYY-MM-DD')`;
  }

  /**
   * Returns a SQL snippet that formats a date column as a local 'YYYY-MM' string.
   */
  formatMonthSql(column: AnyColumn | SQL): SQL<string> {
    return sql<string>`TO_CHAR(${this.toLocalSql(column)}, 'YYYY-MM')`;
  }

  /**
   * Parses a local 'YYYY-MM-DD' string into an absolute UTC Date object at midnight local time.
   */
  parseLocalToUtc(dateStr: string): Date {
    return parseLocalToUtcShared(this.timezone, dateStr);
  }

  /**
   * Returns the current local date as a 'YYYY-MM-DD' string in the organization's timezone.
   */
  getTodayLocalString(): string {
    return toLocalDayString(this.timezone);
  }

  /**
   * Returns a true UTC Date object representing the start of a local day (00:00:00).
   */
  getStartOfDayUtc(dateStr?: string): Date {
    return localDayStartUtc(this.timezone, dateStr);
  }

  /**
   * Returns a true UTC Date object representing the end of a local day (23:59:59.999).
   */
  getEndOfDayUtc(dateStr?: string): Date {
    return localDayEndUtc(this.timezone, dateStr);
  }

  /**
   * Returns a true UTC Date object representing the start of a local month.
   */
  getStartOfMonthUtc(monthsAgo: number = 0): Date {
    return localMonthStartUtc(this.timezone, monthsAgo);
  }
}
