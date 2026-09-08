import { test, expect } from '@playwright/test';

test.describe('Console — Authentication', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('ADMINISTRACIÓN');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('redirects to dashboard when already authenticated', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: 'SaaS Platform Admin' })).toBeVisible({
      timeout: 15_000,
    });
  });
});