import { test, expect } from '../fixtures';
import { uid } from '../helpers/api';
import { findMemberByEmail } from '../helpers/domain';
import { openModal } from '../helpers/modal';
import { SELECTORS } from '../helpers/selectors';
import { TEST_MEMBERS } from '../helpers/test-tenant';

test.describe('Panel — Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/members', { waitUntil: 'domcontentloaded' });
  });

  test('lista los clientes sembrados por el setup', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Clientes' })).toBeVisible({
      timeout: 20_000,
    });
    // El tenant de pruebas ya trae 3 clientes fijos (ver test-tenant.ts).
    await expect(page.getByText('Ana E2E Activa')).toBeVisible({ timeout: 20_000 });
  });

  test('muestra la sección de KPIs con las seis tarjetas', async ({ page }) => {
    await expect(page.locator(SELECTORS.members.kpiSection)).toBeVisible({ timeout: 20_000 });
    for (const kpi of [
      SELECTORS.members.kpiTotal,
      SELECTORS.members.kpiActive,
      SELECTORS.members.kpiInactive,
      SELECTORS.members.kpiNew,
      SELECTORS.members.kpiWithoutSubscription,
      SELECTORS.members.kpiPortal,
    ]) {
      await expect(page.locator(kpi)).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.locator(SELECTORS.members.kpiTotal)).toContainText('Total Clientes');
  });

  test('muestra la gráfica de crecimiento y el widget de cumpleaños', async ({ page }) => {
    await expect(page.locator(SELECTORS.members.growthChart)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(SELECTORS.members.birthdays)).toBeVisible();
  });

  test('los filtros de estado y suscripción actualizan la URL', async ({ page }) => {
    await expect(page.locator(SELECTORS.members.filterStatus)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(SELECTORS.members.filterSubscription)).toBeVisible();

    await page
      .locator(SELECTORS.members.filterStatus)
      .getByRole('button', { name: 'Inactivos' })
      .click();
    await expect(page).toHaveURL(/active=false/, { timeout: 15_000 });

    await page
      .locator(SELECTORS.members.filterSubscription)
      .getByRole('button', { name: 'Sin plan' })
      .click();
    await expect(page).toHaveURL(/subscription=none/, { timeout: 15_000 });
    await expect(page).toHaveURL(/active=false/);
  });

  test('crea un cliente desde la UI y lo deja listado', async ({ page, panelApi }) => {
    const lastName = `E2E UI ${uid()}`;
    const email = `ui-${uid()}@e2e.test`;

    const modal = await openModal(page, page.getByRole('button', { name: 'NUEVO CLIENTE' }));
    await modal.getByLabel('Nombre', { exact: true }).fill('Nadia');
    await modal.getByLabel('Apellido', { exact: true }).fill(lastName);
    await modal.getByLabel('Correo Electrónico', { exact: true }).fill(email);
    await modal.getByRole('button', { name: 'CREAR CLIENTE' }).click();

    await expect(modal).toBeHidden({ timeout: 20_000 });

    await page.getByPlaceholder('Buscar por nombre, email...').fill(email);
    await expect(page.getByText(`Nadia ${lastName}`)).toBeVisible({ timeout: 20_000 });

    // El cliente se creó por UI: se resuelve su id y se registra para que el
    // fixture lo borre al terminar el test.
    const created = await findMemberByEmail(panelApi, email);
    panelApi.track('member', created.id, `member UI ${email}`);
  });

  test('el modal de creación no envía sin los campos obligatorios', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'NUEVO CLIENTE' }));
    await modal.getByRole('button', { name: 'CREAR CLIENTE' }).click();
    // Sin nombre/apellido/email el formulario no se cierra.
    await expect(modal).toBeVisible();
  });

  test('la búsqueda filtra por el cliente inactivo sembrado', async ({ page }) => {
    await page.getByPlaceholder('Buscar por nombre, email...').fill(TEST_MEMBERS.inactive.email);
    await expect(page.getByText('Carla E2E Inactiva')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Ana E2E Activa')).toBeHidden();
  });
});
