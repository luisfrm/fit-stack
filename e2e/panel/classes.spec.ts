import { test, expect } from '@playwright/test';
import { openModal } from '../helpers/modal';

test.describe('Panel — Classes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'domcontentloaded' });
  });

  test('displays classes page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Gestión de Clases' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows create class button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nueva Clase' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('can open create class modal', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'Nueva Clase' }));
    await expect(modal).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar clase o entrenador...')).toBeVisible({
      timeout: 20_000,
    });
  });
});