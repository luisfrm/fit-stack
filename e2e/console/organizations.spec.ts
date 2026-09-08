import { test, expect } from '@playwright/test';

test.describe('Console — Organizations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/organizations', { waitUntil: 'domcontentloaded' });
  });

  test('displays organizations page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Organizaciones' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar por nombre o slug...')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows create organization button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'NUEVA ORGANIZACIÓN' })).toBeVisible({
      timeout: 20_000,
    });
  });
});