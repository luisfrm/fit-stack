import { test, expect } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';

test.describe('Console — Settings', () => {
  test('displays settings page (redirects to general)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/general/, { timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: 'Configuración de Plataforma' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows settings navigation tabs', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href="/settings/general"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('a[href="/settings/currencies"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/payment-methods"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/free-tier"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/ai-provider"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/knowledge"]')).toBeVisible();
  });

  test('can navigate to currencies settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/currencies"]'), /\/settings\/currencies/);
    await expect(page.locator('h1').filter({ hasText: 'Configuración de Plataforma' })).toBeVisible();
  });

  test('can navigate to free tier settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/free-tier"]'), /\/settings\/free-tier/);
    await expect(page.locator('h1').filter({ hasText: 'Configuración de Plataforma' })).toBeVisible();
  });
});