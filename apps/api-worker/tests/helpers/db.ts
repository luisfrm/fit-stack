/**
 * Test database access with hard safety guards.
 *
 * Philosophy (mirrors the pytest suite of the sibling project): no mocks, no
 * SQLite, no Docker. Tests talk HTTP to the real Hono app, which talks to a
 * real Postgres (a Neon branch) through the same Neon HTTP driver used in
 * production.
 *
 * If `TEST_DATABASE_URL` is absent the whole integration suite skips with a
 * clear message instead of silently passing.
 */
import { neon } from '@neondatabase/serverless';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';

/** Human-readable reason the integration suite is being skipped, if any. */
export const skipReason = TEST_DATABASE_URL
  ? null
  : 'TEST_DATABASE_URL is not set — integration tests skipped. Add it to apps/api-worker/.dev.vars (a dedicated Neon branch, never production).';

/**
 * Guard: the test database must never be the production/dev database.
 * Compares hostname + database name, ignoring credentials and query params.
 */
function assertNotProductionDatabase(): void {
  const prodUrl = process.env.DATABASE_URL;
  if (!prodUrl || !TEST_DATABASE_URL) return;

  const identity = (raw: string) => {
    try {
      const url = new URL(raw);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return raw;
    }
  };

  if (identity(prodUrl) === identity(TEST_DATABASE_URL)) {
    throw new Error(
      'REFUSING TO RUN: TEST_DATABASE_URL points at the same host+database as DATABASE_URL. ' +
        'Integration tests truncate every table — point TEST_DATABASE_URL at a dedicated Neon branch.',
    );
  }
}

if (TEST_DATABASE_URL) {
  assertNotProductionDatabase();
}

/**
 * Raw SQL client bound to the test database.
 *
 * Neon's v1 driver only accepts tagged-template usage for the callable form,
 * so all parameterized helpers below go through `sql.query(text, params)`.
 */
export const sql = TEST_DATABASE_URL ? neon(TEST_DATABASE_URL) : null;

/** Runs a parameterized SQL statement against the test database. */
async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!sql) return [];
  return (await sql.query(text, params)) as T[];
}

export { query as testQuery };

/**
 * Every table wiped between test files, ordered so that `CASCADE` never has to
 * resolve a dependency we care about. Kept explicit (rather than reflecting
 * `information_schema`) so that adding a table is a conscious decision.
 */
const TABLES_TO_TRUNCATE = [
  // Gym domain leaves first
  'access_control_log',
  'biometric_sync_task',
  'workout_session_log',
  'workout_session',
  'routine_template_item',
  'routine_template',
  'exercise',
  'coach_assignment',
  'coach_profile',
  'content_block',
  'content_page',
  'gym_class',
  'gym_setting',
  'payment',
  'subscription',
  'membership_plan',
  'gym_member',
  // Platform billing
  'platform_subscription_payment',
  'platform_subscription',
  'platform_plan',
  'platform_setting',
  // Better Auth org layer
  'invitation',
  'member',
  'organization',
  // Better Auth core
  'session',
  'account',
  'verification',
  'user',
] as const;

/**
 * Wipes all application data from the test database.
 * `RESTART IDENTITY` keeps serial ids predictable across runs.
 */
export async function truncateAll(): Promise<void> {
  if (!sql) return;

  const quoted = TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(', ');
  await query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

/**
 * Asserts the schema is present in the test branch, failing with actionable
 * guidance rather than a cryptic "relation does not exist" mid-suite.
 */
export async function assertSchemaReady(): Promise<void> {
  if (!sql) return;

  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );

  const present = new Set(rows.map((r) => r.table_name));
  const required = ['user', 'organization', 'member', 'gym_member', 'membership_plan', 'gym_setting'];
  const missing = required.filter((t) => !present.has(t));

  if (missing.length > 0) {
    throw new Error(
      `Test database is missing tables: ${missing.join(', ')}. ` +
        'Run `pnpm --filter api-worker test:db:push` to sync the schema to TEST_DATABASE_URL.',
    );
  }
}

/** Convenience: read a single setting value straight from the DB. */
export async function readGymSetting(
  organizationId: string,
  key: string,
): Promise<string | undefined> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM gym_setting WHERE organization_id = $1 AND key = $2 LIMIT 1`,
    [organizationId, key],
  );
  return rows[0]?.value;
}

/** Convenience: promote a user to a platform-level global role. */
export async function setUserGlobalRole(userId: string, role: string): Promise<void> {
  await query(`UPDATE "user" SET role = $1 WHERE id = $2`, [role, userId]);
}

/** Convenience: force a subscription's period end (to simulate overdue billing). */
export async function setPlatformSubscriptionPeriodEnd(
  subscriptionId: number,
  periodEnd: Date,
): Promise<void> {
  await query(`UPDATE platform_subscription SET current_period_end = $1 WHERE id = $2`, [
    periodEnd.toISOString(),
    subscriptionId,
  ]);
}
