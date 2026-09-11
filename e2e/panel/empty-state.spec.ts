/**
 * Estados vacíos — organización `e2e-empty` creada por el global-setup.
 *
 * Por qué un archivo aparte: el tenant de la suite (`e2e-suite`) tiene datos
 * sembrados a propósito, así que las aserciones de "no hay clientes / no hay
 * páginas" no pueden convivir con él. Esta org nace vacía en el setup y se
 * borra en el teardown global — este spec no crea ni borra nada.
 *
 * Nota: el `storageState` es propio (otra org = otra sesión). El fixture
 * `panelApi` seguiría apuntando a `e2e-suite`, así que este archivo solo usa
 * `page`; si algún día necesita API, deberá autenticarse contra la org vacía.
 */
import { test, expect } from '../fixtures';
import { AUTH_DIR, EMPTY_OWNER, PANEL_URL, readTenantState } from '../helpers/test-tenant';
import { join } from 'node:path';

const EMPTY_STATE_PATH = join(AUTH_DIR, 'empty-org-user.json');

// El archivo de sesión lo escribe el `beforeAll`; el proyecto lo lee al crear
// cada contexto de test.
test.use({ storageState: EMPTY_STATE_PATH });
test.describe.configure({ mode: 'serial' });

test.describe('Panel — Estados vacíos (organización e2e-empty)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // Falla temprano y con mensaje claro si el global-setup no sembró el tenant.
    const state = readTenantState();
    if (state.emptyOrgSlug !== 'e2e-empty') {
      throw new Error(`state.json no trae la org vacía (slug=${state.emptyOrgSlug})`);
    }

    // Login por UI para dejar un storageState propio de este archivo.
    const context = await browser.newContext({ baseURL: PANEL_URL });
    const page = await context.newPage();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(EMPTY_OWNER.email);
    await page.locator('#password').fill(EMPTY_OWNER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
      timeout: 45_000,
    });
    await context.storageState({ path: EMPTY_STATE_PATH });
    await context.close();
  });

  test('clientes muestra el estado vacío', async ({ page }) => {
    await page.goto('/members', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText('Aún no se han registrado clientes en esta organización.'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('contenido muestra el estado vacío de páginas', async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No hay páginas creadas aún.')).toBeVisible({ timeout: 20_000 });
  });
});
