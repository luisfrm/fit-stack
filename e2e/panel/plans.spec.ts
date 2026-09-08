import { test, expect } from '@playwright/test';
import { openModal } from '../helpers/modal';

test.describe('Panel — Plans / Memberships', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/memberships', { waitUntil: 'domcontentloaded' });
  });

  test('displays memberships page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Planes de Membresía' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows create plan button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'NUEVO PLAN' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('can open create plan modal', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'NUEVO PLAN' }));
    await expect(modal).toBeVisible();
  });

  test('shows stat cards', async ({ page }) => {
    await expect(page.getByText('Planes Activos')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Suscripciones Totales')).toBeVisible({ timeout: 10_000 });
  });
});