import { test, expect } from '@playwright/test';

test.describe('Console — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  });

  test('displays dashboard page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'SaaS Platform Admin' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows platform stats', async ({ page }) => {
    await expect(page.getByText('Total Gimnasios')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Miembros Globales')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ingresos B2B')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Estado Sistema')).toBeVisible({ timeout: 10_000 });
  });

  test('has working sidebar navigation', async ({ page }) => {
    const sidebar = page.locator('nav').first();
    await expect(sidebar).toBeVisible();

    await expect(page.locator('nav').getByRole('link', { name: 'Organizaciones', exact: true })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Suscripciones' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Planes' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Staff' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Configuración' })).toBeVisible();
  });
});