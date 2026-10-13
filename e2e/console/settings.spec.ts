import { test, expect, type Page } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';
import { uid } from '../helpers/api';

/**
 * Saves the emitter identity and confirms the result by reloading.
 *
 * Covers two real races of the flow, not an optimistic assertion:
 * - `PlatformEmitterSettings` fires the toast **before** `onSaved()`, so the
 *   `console:settings` invalidation (`updateTag`) lands later: an immediate
 *   `reload` may serve the cached value (`revalidate: 600`).
 * - A `fill` that lands before hydration does not update React state, so the
 *   save persists the previous value (same race as `navigateByClick`/`openModal`).
 */
async function saveEmitterIdentity(page: Page, legalName: string, taxId: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId('emitter-legal-name').fill(legalName);
    await page.getByTestId('emitter-tax-id').fill(taxId);
    await page.getByTestId('emitter-save').click();
    await expect(page.getByText('Identidad del emisor actualizada correctamente').first()).toBeVisible({
      timeout: 10_000,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('emitter-legal-name')).toHaveValue(legalName, { timeout: 5_000 });
    await expect(page.getByTestId('emitter-tax-id')).toHaveValue(taxId, { timeout: 5_000 });
  }).toPass({ timeout: 25_000 });
}

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
    // Two full cycles (probe + restore), each one retried internally.
    test.setTimeout(120_000);

    await page.goto('/settings/emitter', { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('emitter-section');
    await expect(section).toBeVisible({ timeout: 20_000 });

    const originalName = await page.getByTestId('emitter-legal-name').inputValue();
    const originalTaxId = await page.getByTestId('emitter-tax-id').inputValue();
    const probe = `Emisor E2E ${uid()}`;
    const probeTaxId = `TAX-${uid()}`;

    try {
      await saveEmitterIdentity(page, probe, probeTaxId);
    } finally {
      // Restore: `platform_setting` is a global singleton — leave no residue
      // even when the happy path fails.
      await saveEmitterIdentity(page, originalName, originalTaxId);
    }
  });
});