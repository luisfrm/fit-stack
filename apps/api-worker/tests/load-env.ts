/**
 * Loads `.dev.vars` (Wrangler's local-secrets convention) into `process.env`.
 *
 * Shared by the per-file setup (`setup.ts`) and the global setup
 * (`global-setup.ts`): both run in different processes, so the lock in the
 * global setup needs `TEST_DATABASE_URL` loaded too. Values already present in
 * the real environment (e.g. CI secrets) always win, so CI needs no `.dev.vars`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEV_VARS_PATH = resolve(__dirname, '../.dev.vars');

export function loadDevVars(): void {
  if (!existsSync(DEV_VARS_PATH)) return;

  const contents = readFileSync(DEV_VARS_PATH, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    // Strip optional surrounding quotes (single or double).
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/s, '$2');

    process.env[key] = value;
  }
}
