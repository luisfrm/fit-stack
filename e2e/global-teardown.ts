/**
 * Global teardown — deletes the tenant of the suite.
 *
 * The normal suite is tests only: at the end neither the org (`e2e-suite`,
 * `e2e-empty`), nor the users, nor the platform plan remain.
 *
 * It always runs at the end (even with failures), unless
 * `E2E_KEEP_DATA=1` asks to keep it for manual inspection. It is best-effort on
 * purpose: a cleanup failure does not mark the suite red (the reset of the
 * next global-setup picks it up anyway, with the same fixed slugs).
 *
 * The demo org (`fit-stack`) is NEVER touched here.
 */
import type { FullConfig } from '@playwright/test';
import { wipeTenant } from './helpers/db';
import {
  KEEP_DATA,
  RESERVED_EMAILS,
  SUITE_ORG_SLUGS,
  TEST_ORG,
} from './helpers/test-tenant';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  if (KEEP_DATA) {
    console.log(
      `[e2e] E2E_KEEP_DATA=1 — se conservan las orgs de la suite para inspección.`,
    );
    return;
  }

  try {
    await wipeTenant({
      orgSlugs: SUITE_ORG_SLUGS,
      emails: RESERVED_EMAILS,
    });
    console.log(`[e2e] tenant de la suite eliminado (org=${TEST_ORG.slug}).`);
  } catch (err) {
    console.error('[e2e] teardown falló (se ignorará; el próximo setup lo resetea):', err);
  }
}
