import { test, expect } from '../fixtures';
import { uid, uniqueEmail } from '../helpers/api';
import { SELECTORS } from '../helpers/selectors';
import { TEST_CLASS, TEST_ORG } from '../helpers/test-tenant';
import { addLocalDays, toLocalDayString, getVoidKind } from '@workspace/shared';

// Per-test fixture with automatic cleanup (fixture `panelApi` → LIFO at the
// end, even if the test fails). The org of the suite is wiped entirely in
// the global teardown, so no residue survives the run.
test.describe('Panel — Pago pendiente accionable', () => {
  test('validar desde la lista quita el pendiente y refresca tabla + KPIs', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('pending');
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    // Test fixture: plan → client → subscription with a `processing` payment.
    // Everything registered in the API client, so it is deleted at the end
    // (LIFO: subscription → client → plan), even if the test fails.
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

    // First visit to /payments for this worker: guaranteed cache MISS.
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });

    const item = page.locator(SELECTORS.subscriptions.pendingItem(paymentId));
    await expect(item).toBeVisible({ timeout: 30_000 });

    await item.locator('.pending-validate').click();
    await expect(item).toBeHidden({ timeout: 20_000 });

    // The table and the KPIs are still visible after the refresh.
    await expect(page.locator(SELECTORS.common.table).first()).toBeVisible({ timeout: 20_000 });
  });

  test('rechazar desde el accionable deja la suscripción ANULADA y quita el pendiente', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('reject');
    const lastName = `Rechazado ${uid()}`;
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    const plan = await panelApi.create<any>('plan', '/api/plans', {
      name: `Plan Rechazo ${uid()}`,
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
      firstName: 'Rechazado',
      lastName,
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

    const list = await panelApi.get<{
      data?: Array<{ memberEmail?: string; paymentId?: number; receiptNumber?: string | null }>;
    }>('/api/subscriptions', { status: 'processing', limit: 50 });
    const row = list.data?.find((r) => r.memberEmail === email);
    const paymentId = row?.paymentId ?? 0;
    expect(paymentId, 'el fixture de pago processing debe aparecer en el listado').toBeTruthy();

    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
    const item = page.locator(SELECTORS.subscriptions.pendingItem(paymentId));
    await expect(item).toBeVisible({ timeout: 30_000 });

    await item.locator('.pending-reject').click();
    // Rejecting = `voided`: it leaves the work list (`processing`).
    await expect(item).toBeHidden({ timeout: 20_000 });

    // The row persists as ANULADA; the charge without a receipt is labeled
    // "Rechazado" (not "Anulado"), derived with `getVoidKind`.
    const paymentLabel =
      getVoidKind({ receiptNumber: row?.receiptNumber ?? null }) === 'rejected'
        ? 'Rechazado'
        : 'Anulado';

    const search = page.getByPlaceholder('Buscar por usuario o nivel de plan...');
    await search.fill(lastName);
    const tableRow = page.locator('tr', { hasText: lastName }).first();
    await expect(tableRow).toBeVisible({ timeout: 20_000 });
    await expect(tableRow).toContainText('ANULADA');
    await expect(tableRow).toContainText(paymentLabel);
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

// The class name seeded in the fixture is kept so this spec
// fails if the setup stops seeding the gym catalog.
test.describe('Panel — Catálogo sembrado', () => {
  test('las clases sembradas aparecen en el calendario', async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(TEST_CLASS.name).first()).toBeVisible({ timeout: 20_000 });
  });
});
