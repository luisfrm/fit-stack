import { test, expect } from '../fixtures';
import { openModal } from '../helpers/modal';
import { TEST_PLAN } from '../helpers/test-tenant';

test.describe('Panel — Planes de membresía', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/memberships', { waitUntil: 'domcontentloaded' });
  });

  test('lista el plan sembrado por el setup', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Planes de Membresía' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(TEST_PLAN.name)).toBeVisible({ timeout: 20_000 });
  });

  test('muestra las tarjetas de estadísticas', async ({ page }) => {
    await expect(page.getByText('Planes Activos')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Suscripciones Totales')).toBeVisible({ timeout: 10_000 });
  });

  test('abre el modal de creación de plan', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'NUEVO PLAN' }));
    await expect(modal).toBeVisible();
  });
});
