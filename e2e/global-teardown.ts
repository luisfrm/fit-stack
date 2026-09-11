/**
 * Global teardown — borra el tenant de la suite.
 *
 * La suite normal son solo tests: al terminar no queda ni la org (`e2e-suite`,
 * `e2e-empty`), ni los usuarios, ni el plan de plataforma.
 *
 * Se ejecuta siempre al terminar (incluso con fallos), salvo que
 * `E2E_KEEP_DATA=1` pida conservarlo para inspección manual. Es best-effort a
 * propósito: un fallo de limpieza no marca la suite como roja (el reset del
 * próximo global-setup lo recoge igual, con los mismos slugs fijos).
 *
 * La org de demo (`fit-stack`) NUNCA se toca aquí.
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
