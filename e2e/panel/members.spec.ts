import { test, expect } from '@playwright/test';
import { openModal } from '../helpers/modal';

test.describe('Panel — Members', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/members', { waitUntil: 'domcontentloaded' });
  });

  test('displays members page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Clientes' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows search input', async ({ page }) => {
    const search = page.getByPlaceholder('Buscar por nombre, email...');
    await expect(search).toBeVisible({ timeout: 20_000 });
  });

  test('shows create member button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'NUEVO CLIENTE' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('can open create member modal', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'NUEVO CLIENTE' }));
    await expect(modal).toBeVisible();
  });

  test('shows empty state for new org', async ({ page }) => {
    await expect(page.getByText('Aún no se han registrado clientes en esta organización.')).toBeVisible({
      timeout: 20_000,
    });
  });
});