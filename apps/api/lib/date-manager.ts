import { AnyColumn, sql, SQL } from "@workspace/database/client";

/**
 * SOLID: Contextual class that manages all Date and Timezone logic for a specific organization.
 * This abstracts away the complexity of PostgreSQL AT TIME ZONE logic and local date parsing.
 */
export class OrganizationDateManager {
  constructor(public readonly timezone: string) { }

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
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      timeZoneName: 'longOffset'
    }).formatToParts(new Date(dateStr));

    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    const offset = offsetPart.replace('GMT', '');

    const finalOffset = offset === '' ? '+00:00' : (!offset.includes(':') ? `${offset[0]}${offset.slice(1).padStart(2, '0')}:00` : offset);

    return new Date(`${dateStr}T00:00:00${finalOffset}`);
  }

  /**
   * Returns the current local date as a 'YYYY-MM-DD' string in the organization's timezone.
   */
  getTodayLocalString(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  /**
   * Returns a true UTC Date object representing the start of a local day (00:00:00).
   * @param dateStr Optional 'YYYY-MM-DD' string. Defaults to today.
   */
  getStartOfDayUtc(dateStr?: string): Date {
    const targetDate = dateStr || this.getTodayLocalString();
    return this.parseLocalToUtc(targetDate);
  }

  /**
   * Returns a true UTC Date object representing the end of a local day (23:59:59.999).
   * @param dateStr Optional 'YYYY-MM-DD' string. Defaults to today.
   */
  getEndOfDayUtc(dateStr?: string): Date {
    const targetDate = dateStr || this.getTodayLocalString();
    const nextDay = new Date(this.getStartOfDayUtc(targetDate));
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return new Date(nextDay.getTime() - 1);
  }

  /**
   * Returns a true UTC Date object representing the start of a local month.
   * @param monthsAgo Number of months to go back from current local month.
   */
  getStartOfMonthUtc(monthsAgo: number = 0): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      year: 'numeric',
      month: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;
    
    let year = parseInt(getPart('year')!, 10);
    let month = parseInt(getPart('month')!, 10);
    
    month -= monthsAgo;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;
    return this.parseLocalToUtc(dateStr);
  }
}
