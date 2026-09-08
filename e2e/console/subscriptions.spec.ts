import { test, expect } from '@playwright/test';

test.describe('Console — Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subscriptions', { waitUntil: 'domcontentloaded' });
  });

  test('displays subscriptions page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Suscripciones' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar por organización o plan...')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('has status filter options', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Activas', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Trial', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Por Vencer', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Suspendidas', exact: true })).toBeVisible({ timeout: 10_000 });
  });
});