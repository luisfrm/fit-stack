import { test, expect } from "../fixtures";
import { openModal } from "../helpers/modal";
import { TEST_CMS_PAGE } from "../helpers/test-tenant";

test.describe("Panel — Contenido / CMS", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
  });

  test('lista la página sembrada por el setup', async ({ page }) => {
    await expect(page.getByText('Gestión de Contenido')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(TEST_CMS_PAGE.title)).toBeVisible({ timeout: 20_000 });
  });

  test('abre el modal de creación de página', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'Nueva Página' }));
    await expect(modal).toBeVisible();
  });
});
