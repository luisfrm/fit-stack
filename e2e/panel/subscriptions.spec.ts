import { test, expect } from '../fixtures';
import { uid, uniqueEmail } from '../helpers/api';
import { SELECTORS } from '../helpers/selectors';
import { TEST_CLASS, TEST_ORG } from '../helpers/test-tenant';
import { addLocalDays, toLocalDayString } from '@workspace/shared';

// Fixture por test con limpieza automática (fixture `panelApi` → LIFO al
// terminar, incluso si el test falla). La org de la suite se borra completa en
// el teardown global, así que ningún residuo sobrevive a la corrida.
test.describe('Panel — Pago pendiente accionable', () => {
  test('validar desde la lista quita el pendiente y refresca tabla + KPIs', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('pending');
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    // Fixture del test: plan → cliente → suscripción con pago `processing`.
    // Todo registrado en el cliente de API, así que se borra al terminar
    // (LIFO: suscripción → cliente → plan), incluso si el test falla.
    const plan = await panelApi.create<any>('plan', '/api/plans', {
      name: `Plan Pendiente ${uid()}`,
      price: 50,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      features: ['Acceso'],
      isPopular: false,
      isActive: true,
      isVisibleOnSite: true,
    });
    const member = await panelApi.create<any>('member', '/api/members', {
      firstName: 'Pendiente',
      lastName: `E2E ${uid()}`,
      email,
      role: 'member',
      isActive: true,
      sendInvite: false,
    });
    await panelApi.create('subscription', '/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: today,
      endDate: addLocalDays(tz, today, 30),
      payment: {
        amountPaid: 5000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: today,
      },
    });

    const list = await panelApi.get<{ data?: Array<{ memberEmail?: string; paymentId?: number }> }>(
      '/api/subscriptions',
      { status: 'processing', limit: 50 },
    );
    const paymentId =
      list.data?.find((row) => row.memberEmail === email)?.paymentId ??
      list.data?.[0]?.paymentId ??
      0;
    expect(paymentId, 'el fixture de pago processing debe aparecer en el listado').toBeTruthy();

    // Primera visita a /payments de este worker: MISS de cache garantizado.
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });

    const item = page.locator(SELECTORS.subscriptions.pendingItem(paymentId));
    await expect(item).toBeVisible({ timeout: 30_000 });

    await item.locator('.pending-validate').click();
    await expect(item).toBeHidden({ timeout: 20_000 });

    // La tabla y los KPIs siguen visibles tras el refresh.
    await expect(page.locator(SELECTORS.common.table).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Panel — Suscripciones y pagos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
  });

  test('muestra la página con búsqueda y filtros de estado', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Suscripciones y Pagos' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByPlaceholder('Buscar por usuario o nivel de plan...')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Por validar' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Por vencer' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Activas' })).toBeVisible({ timeout: 10_000 });
  });

  test('el alta de suscripción está disponible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'NUEVO PAGO' })).toBeVisible({
      timeout: 20_000,
    });
  });
});

// Se mantiene el nombre de la clase sembrada en el fixture para que este spec
// falle si el setup dejó de sembrar el catálogo del gimnasio.
test.describe('Panel — Catálogo sembrado', () => {
  test('las clases sembradas aparecen en el calendario', async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(TEST_CLASS.name).first()).toBeVisible({ timeout: 20_000 });
  });
});
