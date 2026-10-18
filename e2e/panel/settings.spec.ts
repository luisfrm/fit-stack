import { test, expect } from '@playwright/test';
import { navigateByClick } from '../helpers/nav';
import { checkSwitch, selectOption } from '../helpers/interactions';
import { uid } from '../helpers/api';
import { TEST_MEMBERS, TEST_PLAN } from '../helpers/test-tenant';

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

  test('guarda la configuración fiscal y la re-renderiza persistida', async ({ page }) => {
    await page.goto('/settings/organization', { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('org-fiscal-section');
    await expect(section).toBeVisible({ timeout: 30_000 });

    const disclaimer = `Aviso fiscal E2E ${uid()}`;
    await section.getByLabel('Disclaimer legal alternativo').fill(disclaimer);

    // Formal declaration with double confirmation (intentional friction).
    await section.getByRole('checkbox', { name: 'Declaración de contribuyente formal' }).check();
    await section.getByRole('button', { name: 'Guardar facturación' }).click();
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Confirmar declaración formal' });
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole('button', { name: 'Confirmar declaración' }).click();

    await expect(page.getByText('Configuración fiscal guardada correctamente').first()).toBeVisible({
      timeout: 20_000,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = page.getByTestId('org-fiscal-section');
    await expect(reloaded).toBeVisible({ timeout: 30_000 });
    await expect(reloaded.getByLabel('Disclaimer legal alternativo')).toHaveValue(disclaimer);
    await expect(
      reloaded.getByRole('checkbox', { name: 'Declaración de contribuyente formal' }),
    ).toBeChecked();
    // Without real homologation, the applied label is still receipt.
    await expect(reloaded.getByText('Comprobante de pago').first()).toBeVisible();
  });

  test('guarda los datos generales de la sede (endpoint org-scoped)', async ({ page }) => {
    await page.goto('/settings/organization', { waitUntil: 'domcontentloaded' });

    const slogan = page.getByLabel('Eslogan / Lema');
    await expect(slogan).toBeVisible({ timeout: 30_000 });

    // The slogan is data owned by the branch and other specs do not assert it.
    const value = `Sede E2E ${uid()}`;
    await slogan.fill(value);
    await page.getByRole('button', { name: 'Actualizar Sede' }).click();

    // Regression: the general save called `/api/platform/organizations`
    // (`requirePlatformAuth`) → 403 for a gym owner. The success toast is
    // the signal that it now uses the real org-scoped endpoint.
    await expect(
      page.getByText('Información de la sede actualizada correctamente').first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Eslogan / Lema')).toHaveValue(value, { timeout: 30_000 });
  });

  // It depends on the spec "guarda la configuración fiscal…" (above) having
  // declared the branch as a formal taxpayer: without that declaration the
  // manual tax override is not even offered (the override only reduces).
  test('override de impuestos sin motivo muestra error genérico', async ({ page }) => {
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'NUEVO PAGO' }).click();

    const dialog = page.locator('dialog, [role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    await dialog.getByPlaceholder('Escribe el nombre, email o DNI...').fill(
      TEST_MEMBERS.withoutPlan.email,
    );
    await expect(dialog.getByText(TEST_MEMBERS.withoutPlan.email).first()).toBeVisible({
      timeout: 20_000,
    });
    await dialog.getByText(TEST_MEMBERS.withoutPlan.email).first().click();
    await dialog.getByRole('button', { name: new RegExp(TEST_PLAN.name, 'i') }).click();

    // The payment method is required: without it the payment validation returns
    // early, before the tax override is evaluated, and the asserted toast would
    // be a different one. The combobox exposes no accessible name (the
    // `SimpleSelect` Label is not associated), so it is located by its rendered
    // placeholder.
    await selectOption(
      page,
      dialog.getByRole('combobox').filter({ hasText: 'Seleccionar Método' }),
      'Otro / Personalizado',
    );
    await dialog.locator('#other-method-details').fill('Efectivo E2E');

    await checkSwitch(
      dialog.getByRole('switch', { name: 'Ajuste manual de impuestos' }),
    );
    await dialog.getByRole('button', { name: 'GENERAR SUSCRIPCIÓN' }).click();

    await expect(
      page.getByText('Indica el motivo del ajuste manual de impuestos').first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});