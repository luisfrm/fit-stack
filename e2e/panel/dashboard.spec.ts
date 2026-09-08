import { test, expect } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';

test.describe('Panel — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  });

  test('displays dashboard page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows KPI stats section', async ({ page }) => {
    await expect(page.getByText('Miembros Activos')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Clases Hoy')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ingresos del Día')).toBeVisible({ timeout: 10_000 });
  });

  test('has working sidebar navigation', async ({ page }) => {
    const sidebar = page.locator('nav').first();
    await expect(sidebar).toBeVisible();

    await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Pagos' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Clientes' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Membresías' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Clases' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Configuración' })).toBeVisible();
  });

  test('navigates to members page from sidebar', async ({ page }) => {
    // The sidebar is a client component: its links appear only after the
    // session resolves client-side, so wait for visibility before clicking.
    const membersLink = page.locator('nav').getByRole('link', { name: 'Clientes' });
    await navigateByClick(page, membersLink, /\/members/, 30_000);
    await expect(page.locator('h1').filter({ hasText: 'Clientes' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('navigates to settings page from sidebar', async ({ page }) => {
    const settingsLink = page.locator('nav').getByRole('link', { name: 'Configuración' });
    await navigateByClick(page, settingsLink, /\/settings/, 30_000);
    await expect(page.locator('h1').filter({ hasText: 'Centro de Comando' })).toBeVisible({
      timeout: 15_000,
    });
  });
});