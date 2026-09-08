/**
 * E2E test helpers — direct DB access for role promotion.
 *
 * The console requires platform roles (owner/admin) which have no
 * self-promotion endpoint, so E2E setup must write directly to the
 * development database (the same one the dev api-worker uses via
 * DATABASE_URL from apps/api-worker/.dev.vars).
 *
 * Environment variables (loaded from .dev.vars if not present):
 *   DATABASE_URL — dev database URL
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

const DEV_VARS_PATH = resolve(process.cwd(), 'apps/api-worker/.dev.vars');

/** Loads .dev.vars into process.env (existing env vars win). */
function loadDevVars(): void {
  if (!existsSync(DEV_VARS_PATH)) return;

  const contents = readFileSync(DEV_VARS_PATH, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/s, '$2');

    process.env[key] = value;
  }
}

loadDevVars();

const DATABASE_URL = process.env.DATABASE_URL ?? '';

/** Raw SQL client bound to the dev database (used by the dev api-worker). */
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/** Runs a parameterized SQL statement against the dev database. */
async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!sql) throw new Error('DATABASE_URL not loaded from apps/api-worker/.dev.vars');
  return (await sql.query(text, params)) as T[];
}

export { query as e2eQuery };

/**
 * Promotes a user to a platform role (owner/admin/support) by writing
 * directly to the `user` table — mirrors `registerPlatformUser` in the
 * api-worker integration tests.
 */
export async function setUserPlatformRole(userId: string, role: string): Promise<void> {
  await query(`UPDATE "user" SET role = $1 WHERE id = $2`, [role, userId]);
}

/** Convenience: read a single gym_setting value. */
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
