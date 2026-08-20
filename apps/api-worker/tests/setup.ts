/**
 * Vitest setup: loads local secrets from `.dev.vars` into `process.env`.
 *
 * `.dev.vars` is the Wrangler convention for local Worker secrets and is
 * gitignored, so it is the natural place to keep `TEST_DATABASE_URL`.
 * Values already present in the real environment (e.g. GitHub Actions secrets)
 * always win, so CI does not need a `.dev.vars` file at all.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEV_VARS_PATH = resolve(__dirname, '../.dev.vars');

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

    // Strip optional surrounding quotes (single or double).
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/s, '$2');

    process.env[key] = value;
  }
}

loadDevVars();
