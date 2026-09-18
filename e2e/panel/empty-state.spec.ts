/**
 * Estados vacíos — organización `e2e-empty` creada por el global-setup.
 *
 * Por qué un archivo aparte: el tenant de la suite (`e2e-suite`) tiene datos
 * sembrados a propósito, así que las aserciones de "no hay clientes / no hay
 * páginas" no pueden convivir con él. Esta org nace vacía en el setup y se
 * borra en el teardown global — este spec no crea ni borra nada.
 *
 * El `storageState` es propio (otra org = otra sesión) y lo escribe
 * `panel-setup` antes de que este proyecto cree cualquier contexto. El fixture
 * `panelApi` seguiría apuntando a `e2e-suite`, así que este archivo solo usa
 * `page`; si algún día necesita API, deberá autenticarse contra la org vacía.
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
