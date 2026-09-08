import { test, expect } from '@playwright/test';

test.describe('Panel — Subscriptions / Payments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
  });

  test('displays payments page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Suscripciones y Pagos' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows search input for payments', async ({ page }) => {
    const search = page.getByPlaceholder('Buscar por usuario o nivel de plan...');
    await expect(search).toBeVisible({ timeout: 20_000 });
  });

  test('shows create payment button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'NUEVO PAGO' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('has status filter options', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Por validar' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Por vencer' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Activas' })).toBeVisible({
      timeout: 10_000,
    });
  });
});