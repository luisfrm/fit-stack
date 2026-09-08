import { test, expect } from '@playwright/test';

test.describe('Console — Plans', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plans', { waitUntil: 'domcontentloaded' });
  });

  test('displays plans page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Planes de Plataforma' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows create plan button', async ({ page }) => {
    // The empty state uses "CREAR PRIMER PLAN", otherwise "NUEVO PLAN"
    const createBtn = page.locator('button:has-text("NUEVO PLAN"), button:has-text("CREAR PRIMER PLAN")').first();
    await expect(createBtn).toBeVisible({ timeout: 20_000 });
  });
});