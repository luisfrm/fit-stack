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
 * JavaScript date manipulation (local date parsing, day/month boundaries) delegates
 * to shared `@workspace/shared` utilities (`date.ts`, based on `@date-fns/tz`), ensuring
 * that an 11pm payment in Venezuela falls into the exact local day.
 * SQL logic (AT TIME ZONE) is maintained here.
 */
export class OrganizationDateManager {
  constructor(public readonly timezone: string) {}

  /**
   * Returns a SQL snippet that shifts a UTC database column to the organization's local timezone.
   *
   * Columns are `timestamp with time zone`, so a SINGLE `AT TIME ZONE` already
   * returns the local wall-clock timestamp. Chaining a second `AT TIME ZONE`
   * yields a `timestamptz` that `TO_CHAR`/`::date` formats in the session
   * timezone (GMT on Neon), silently bucketing by UTC instead of the local day.
   */
  toLocalSql(column: AnyColumn | SQL): SQL {
    return sql`${column} AT TIME ZONE ${this.timezone}`;
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
