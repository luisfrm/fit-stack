import { test, expect } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';

test.describe('Panel — Settings', () => {
  test('displays settings page (redirects to general)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/general/, { timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: 'Centro de Comando' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows settings navigation tabs', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href="/settings/general"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('a[href="/settings/organization"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/currencies"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/payment-methods"]')).toBeVisible();
  });

  test('can navigate to organization settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/organization"]'), /\/settings\/organization/);
    await expect(page.locator('h1').filter({ hasText: 'Centro de Comando' })).toBeVisible();
  });

  test('can navigate to currencies settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/currencies"]'), /\/settings\/currencies/);
    await expect(page.locator('h1').filter({ hasText: 'Centro de Comando' })).toBeVisible();
  });

  test('can navigate to payment methods settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/payment-methods"]'), /\/settings\/payment-methods/);
    await expect(page.locator('h1').filter({ hasText: 'Centro de Comando' })).toBeVisible();
  });

  test('general settings has save button', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Guardar Ajustes' })).toBeVisible({
      timeout: 30_000,
    });
  });
});