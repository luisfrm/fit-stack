/**
 * Local-day bucketing of `OrganizationDateManager` (regression).
 *
 * Columns are `timestamp with time zone`, so they must be shifted with a
 * SINGLE `AT TIME ZONE`: chaining a second shift returns a `timestamptz` that
 * `TO_CHAR`/`::date` formats in the session timezone (GMT on Neon), silently
 * bucketing by UTC. The fixed instants below fail at any hour, unlike the
 * time-dependent revenue assertions that only caught this between 20:00 and
 * 24:00 America/Caracas.
 *
 * Standard pattern: runs against the Neon branch (`TEST_DATABASE_URL`) and
 * skips without it.
 */
import { describe, expect, it } from 'vitest';
import { createDb, sql } from '@workspace/database/factory';
import { OrganizationDateManager } from '../../src/lib/date-manager';
import { skipReason, TEST_DATABASE_URL } from '../helpers/db';

describe.skipIf(skipReason !== null)('OrganizationDateManager local-day bucketing', () => {
  const dateManager = new OrganizationDateManager('America/Caracas');

  async function bucket(instant: string): Promise<{ day: string; month: string }> {
    const db = createDb(TEST_DATABASE_URL);
    const instantSql = sql`${instant}::timestamptz`;
    const result = await db.execute<{ day: string; month: string }>(
      sql`SELECT
            ${dateManager.formatDaySql(instantSql)} AS day,
            ${dateManager.formatMonthSql(instantSql)} AS month`,
    );
    return result.rows[0]!;
  }

  it('shifts a 01:00 UTC instant to the previous local day', async () => {
    await expect(bucket('2026-01-02T01:00:00Z')).resolves.toEqual({
      day: '2026-01-01',
      month: '2026-01',
    });
  });

  it('shifts a month-boundary instant to the previous local month', async () => {
    await expect(bucket('2026-02-01T03:30:00Z')).resolves.toEqual({
      day: '2026-01-31',
      month: '2026-01',
    });
  });
});
