/**
 * Panel auth setup — UI login ONLY + storageState.
 *
 * The tenant (user + organization + data) is created by `global-setup.ts` with
 * fixed identities. This file used to create a new organization on every
 * run and never deleted it: that was the source of the `gym-xxxxxxxx` orgs
 * piling up in the development database.
 *
 * Writes TWO sessions, both before the `panel` project creates a single
 * context (that is why they live here and not in a spec `beforeAll`: a
 * `test.use({ storageState })` points to a file that must already exist):
 * - `panel-user.json` → owner of the suite org.
 * - `empty-org-user.json` → owner of the empty org (`empty-state.spec.ts`).
 */
import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prewarmRoutes } from './helpers/prewarm';
import {
  AUTH_DIR,
  EMPTY_ORG,
  EMPTY_OWNER,
  EMPTY_PANEL_PREWARM_ROUTES,
  EMPTY_STATE_PATH,
  PANEL_PREWARM_ROUTES,
  PANEL_STATE_PATH,
  PANEL_URL,
  TEST_OWNER,
  readTenantState,
} from './helpers/test-tenant';

setup('authenticate as panel user', async ({ page, browser }) => {
  // Fails early with a clear message if the global-setup did not seed the tenant.
  const state = readTenantState();
  setup.setTimeout(240_000);
  mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill(TEST_OWNER.email);
  await page.locator('#password').fill(TEST_OWNER.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });

  // The rendered dashboard confirms the active org was stored in the session.
  await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
    timeout: 45_000,
  });

  await prewarmRoutes(page, PANEL_PREWARM_ROUTES);

  await page.context().storageState({ path: PANEL_STATE_PATH });

  console.log(`[e2e] panel autenticado (org=${state.orgSlug})`);

  // ── Empty org session (empty-state specs) ─────────────────────────────────
  if (state.emptyOrgSlug !== EMPTY_ORG.slug) {
    throw new Error(`state.json no trae la org vacía (slug=${state.emptyOrgSlug})`);
  }

  // Own context: it is ANOTHER active organization, it cannot share cookies.
  // Explicit empty `storageState`: the file does not exist yet and this call
  // must not try to read it.
  const emptyContext = await browser.newContext({
    baseURL: PANEL_URL,
    storageState: { cookies: [], origins: [] },
  });
  const emptyPage = await emptyContext.newPage();

  await emptyPage.goto('/login', { waitUntil: 'domcontentloaded' });
  await emptyPage.locator('#email').fill(EMPTY_OWNER.email);
  await emptyPage.locator('#password').fill(EMPTY_OWNER.password);
  await emptyPage.locator('button[type="submit"]').click();
  await emptyPage.waitForURL('**/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await expect(emptyPage.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
    timeout: 45_000,
  });

  await prewarmRoutes(emptyPage, EMPTY_PANEL_PREWARM_ROUTES);

  await emptyContext.storageState({ path: EMPTY_STATE_PATH });
  await emptyContext.close();

  console.log(`[e2e] panel autenticado (org=${state.emptyOrgSlug})`);
});
