/**
 * Panel auth setup — SOLO login por UI + storageState.
 *
 * El tenant (usuario + organización + datos) lo crea `global-setup.ts` con
 * identidades fijas. Antes este archivo creaba una organización nueva por
 * corrida y no la borraba: esa era la fuente de las orgs `gym-xxxxxxxx`
 * acumuladas en la base de datos de desarrollo.
 */
import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prewarmRoutes } from './helpers/prewarm';
import {
  AUTH_DIR,
  PANEL_PREWARM_ROUTES,
  PANEL_STATE_PATH,
  TEST_OWNER,
  readTenantState,
} from './helpers/test-tenant';

setup('authenticate as panel user', async ({ page }) => {
  // Falla temprano y con mensaje claro si el global-setup no sembró el tenant.
  const state = readTenantState();
  setup.setTimeout(240_000);
  mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill(TEST_OWNER.email);
  await page.locator('#password').fill(TEST_OWNER.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });

  // El dashboard renderizado confirma que la org activa quedó en la sesión.
  await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
    timeout: 45_000,
  });

  await prewarmRoutes(page, PANEL_PREWARM_ROUTES);

  await page.context().storageState({ path: PANEL_STATE_PATH });

  console.log(`[e2e] panel autenticado (org=${state.orgSlug})`);
});
