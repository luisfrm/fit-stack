/**
 * Vitest setup: loads local secrets from `.dev.vars` and drains any
 * fire-and-forget work left behind when a file finishes.
 *
 * `.dev.vars` is the Wrangler convention for local Worker secrets and is
 * gitignored, so it is the natural place to keep `TEST_DATABASE_URL`.
 * Values already present in the real environment (e.g. GitHub Actions secrets)
 * always win, so CI does not need a `.dev.vars` file at all.
 */
import { afterAll } from 'vitest';
import { loadDevVars } from './load-env';
import { drainAllPending } from './helpers/pending';

loadDevVars();

// Drain queued `waitUntil` work before the next file truncates the database.
afterAll(async () => {
  await drainAllPending();
});
