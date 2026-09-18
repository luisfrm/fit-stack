/**
 * Panel auth setup — SOLO login por UI + storageState.
 *
 * El tenant (usuario + organización + datos) lo crea `global-setup.ts` con
 * identidades fijas. Antes este archivo creaba una organización nueva por
 * corrida y no la borraba: esa era la fuente de las orgs `gym-xxxxxxxx`
 * acumuladas en la base de datos de desarrollo.
 *
 * Escribe DOS sesiones, ambas antes de que el proyecto `panel` cree un solo
 * contexto (por eso viven aquí y no en un `beforeAll` de un spec: un
 * `test.use({ storageState })` apunta a un archivo que debe existir ya):
 * - `panel-user.json` → owner de la org de la suite.
 * - `empty-org-user.json` → owner de la org vacía (`empty-state.spec.ts`).
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

  // ── Sesión de la org vacía (specs de estado vacío) ────────────────────────
  if (state.emptyOrgSlug !== EMPTY_ORG.slug) {
    throw new Error(`state.json no trae la org vacía (slug=${state.emptyOrgSlug})`);
  }

  // Contexto propio: es OTRA organización activa, no puede compartir cookies.
  // `storageState` vacío explícito: el archivo aún no existe y esta llamada no
  // debe intentar leerlo.
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
