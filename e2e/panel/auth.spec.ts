import { test, expect } from '@playwright/test';

test.describe('Panel — Authentication', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('PANEL');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('redirects to dashboard when already authenticated', async ({ page }) => {
    // storageState has a valid session — login page should redirect
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('shows error with invalid credentials', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill('nonexistent-e2e@test.com');
    await page.locator('#password').fill('WrongPassword123!');
    await page.locator('button[type="submit"]').click();

    // Toast error from sonner
    await expect(page.locator('[data-sonner-toast]')).toContainText('incorrectos', {
      timeout: 10_000,
    });
  });

  test('login form has remember me checkbox', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#remember')).toBeVisible();
  });
});