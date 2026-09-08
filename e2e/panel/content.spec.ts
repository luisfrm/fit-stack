import { test, expect } from '@playwright/test';

test.describe('Panel — Content / CMS', () => {
  test('displays content pages list', async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Gestión de Contenido')).toBeVisible({ timeout: 20_000 });
  });

  test('shows create page button', async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Nueva Página' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows empty state for new org', async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No hay páginas creadas aún.')).toBeVisible({ timeout: 20_000 });
  });
});