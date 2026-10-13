/**
 * Empty states — `e2e-empty` organization created by the global-setup.
 *
 * Why a separate file: the tenant of the suite (`e2e-suite`) has data
 * seeded on purpose, so the assertions of "no hay clientes / no hay
 * páginas" cannot coexist with it. This org is born empty in the setup and
 * is deleted in the global teardown — this spec creates and deletes nothing.
 *
 * The `storageState` is its own (another org = another session) and it is written
 * by `panel-setup` before this project creates any context. The fixture
 * `panelApi` would still point to `e2e-suite`, so this file only uses
 * `page`; if it ever needs the API, it must authenticate against the empty org.
 */
import { test, expect } from '../fixtures';
import { EMPTY_STATE_PATH } from '../helpers/test-tenant';

test.use({ storageState: EMPTY_STATE_PATH });

test.describe('Panel — Estados vacíos (organización e2e-empty)', () => {
  test('clientes muestra el estado vacío', async ({ page }) => {
    await page.goto('/members', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText('Aún no se han registrado clientes en esta organización.'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('contenido muestra el estado vacío de páginas', async ({ page }) => {
    await page.goto('/content', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No hay páginas creadas aún.')).toBeVisible({ timeout: 20_000 });
  });
});
