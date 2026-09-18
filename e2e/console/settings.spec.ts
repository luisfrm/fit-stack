import { test, expect } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';
import { uid } from '../helpers/api';

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

  test('can navigate to emitter settings', async ({ page }) => {
    await page.goto('/settings/general', { waitUntil: 'domcontentloaded' });
    await navigateByClick(page, page.locator('a[href="/settings/emitter"]'), /\/settings\/emitter/);
    await expect(page.getByTestId('emitter-section')).toBeVisible({ timeout: 20_000 });
  });

  test('emitter settings save and re-render persisted (restores values)', async ({ page }) => {
    await page.goto('/settings/emitter', { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('emitter-section');
    await expect(section).toBeVisible({ timeout: 20_000 });

    const legalNameInput = page.getByTestId('emitter-legal-name');
    const taxIdInput = page.getByTestId('emitter-tax-id');
    const originalName = await legalNameInput.inputValue();
    const originalTaxId = await taxIdInput.inputValue();
    const probe = `Emisor E2E ${uid()}`;
    const probeTaxId = `TAX-${uid()}`;

    try {
      await legalNameInput.fill(probe);
      await taxIdInput.fill(probeTaxId);
      await page.getByTestId('emitter-save').click();
      await expect(page.getByText('Identidad del emisor actualizada correctamente').first()).toBeVisible({
        timeout: 20_000,
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('emitter-legal-name')).toHaveValue(probe, { timeout: 20_000 });
      await expect(page.getByTestId('emitter-tax-id')).toHaveValue(probeTaxId, { timeout: 20_000 });
    } finally {
      // Restaurar: platform_setting es singleton global, no dejar residuo
      // ni siquiera si falla el camino feliz.
      await page.getByTestId('emitter-legal-name').fill(originalName);
      await page.getByTestId('emitter-tax-id').fill(originalTaxId);
      await page.getByTestId('emitter-save').click();
      await expect(page.getByText('Identidad del emisor actualizada correctamente').first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });
});