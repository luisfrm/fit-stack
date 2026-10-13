/**
 * Console auth setup — UI login ONLY + storageState.
 *
 * The platform user is created by `global-setup.ts` (sign-up + role promotion
 * via SQL, repeated on every run so the role never depends on the
 * previous state of the environment).
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
  // Fails early with a clear message if the global-setup did not seed the tenant.
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
