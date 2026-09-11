/**
 * Console auth setup — SOLO login por UI + storageState.
 *
 * El usuario de plataforma lo crea `global-setup.ts` (sign-up + promoción de rol
 * por SQL, que se repite en cada corrida para que el rol nunca dependa del
 * estado previo del entorno).
 */
import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prewarmRoutes } from './helpers/prewarm';
import {
  AUTH_DIR,
  CONSOLE_PREWARM_ROUTES,
  CONSOLE_STATE_PATH,
  TEST_PLATFORM,
  readTenantState,
} from './helpers/test-tenant';

setup('authenticate as console user', async ({ page }) => {
  // Falla temprano y con mensaje claro si el global-setup no sembró el tenant.
  const state = readTenantState();
  setup.setTimeout(240_000);
  mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill(TEST_PLATFORM.email);
  await page.locator('#password').fill(TEST_PLATFORM.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });

  await expect(page.locator('h1').filter({ hasText: 'SaaS Platform Admin' })).toBeVisible({
    timeout: 45_000,
  });

  await prewarmRoutes(page, CONSOLE_PREWARM_ROUTES);

  await page.context().storageState({ path: CONSOLE_STATE_PATH });

  console.log(`[e2e] consola autenticada (platform user=${state.platformUserId})`);
});
