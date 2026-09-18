import fs from 'node:fs';
import { test, expect } from '../fixtures';
import { uid } from '../helpers/api';
import { navigateByClick } from '../helpers/nav';
import { SELECTORS } from '../helpers/selectors';
import { TEST_PLATFORM } from '../helpers/test-tenant';
import { toLocalDayString } from '@workspace/shared';

const SUBS = SELECTORS.consoleSubscriptions;
const AUDIT = SELECTORS.consoleReceipts;
const TZ = 'America/Caracas';

// El consumer de renders (jobs-worker) no corre en E2E: tras validar, el
// comprobante queda numerado con PDF pendiente. El spec aserta lo
// determinista — número global visible sin UUID, estados y reenvío.
test.describe('Console — Comprobante SaaS', () => {
  test('aprobar pago pendiente muestra FS-N y permite reenviar', async ({
    page,
    consoleApi,
  }) => {
    const slug = `recibo-${uid()}`;
    const orgName = `Org Recibo ${uid()}`;
    const today = toLocalDayString(TZ);

    const org = await consoleApi.create<any>('platformOrg', '/api/platform/organizations', {
      name: orgName,
      slug,
      countryCode: 'VE',
      timezone: TZ,
    });
    // Owners para el dedupe del reenvío (el pago processing no trae payer):
    // vincula al platform owner existente, sin crear usuarios residuales.
    await consoleApi.post(`/api/platform/organizations/${org.id}/staff`, {
      firstName: 'Recibo',
      lastName: 'E2E',
      email: TEST_PLATFORM.email,
      role: 'owner',
      isActive: true,
      sendInvite: false,
    });
    const plan = await consoleApi.create<any>('platformPlan', '/api/platform/plans', {
      name: `Plan Recibo ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    const sub = await consoleApi.create<any>(
      'platformSubscription',
      '/api/platform/subscriptions',
      {
        organizationId: org.id,
        planId: plan.id,
        startDate: today,
        isTrial: false,
        payment: {
          amountPaidCents: 5000,
          currencyPaid: 'USD',
          baseAmountCents: 5000,
          paymentMethod: 'zelle',
          paymentMethodDetails: [],
          status: 'processing',
          paymentDate: today,
        },
      },
    );
    const payments = await consoleApi.get<Array<{ id: number }>>(
      `/api/platform/subscriptions/${sub.id}/payments`,
    );
    const paymentId = payments[0]!.id;

    await page.goto(`/subscriptions?search=${encodeURIComponent(orgName)}`, {
      waitUntil: 'domcontentloaded',
    });

    const row = page.locator(`[data-testid="subs-row-${sub.id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    // El trigger del menú lleva la clase (sin trigger custom en la tabla).
    await row.locator(SUBS.rowMenu).click();
    await page.getByRole('menuitem', { name: 'Ver Pagos' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const paymentRow = page.locator(`[data-testid="subs-payment-${paymentId}"]`);
    await expect(paymentRow).toBeVisible({ timeout: 20_000 });
    await paymentRow.getByRole('button', { name: 'Acciones de pago' }).click();
    await page.getByRole('menuitem', { name: 'Marcar como Validado' }).click();

    // Tras aprobar, el paso 1 numera: expandir la fila muestra el FS-N.
    await paymentRow.getByRole('button', { name: 'Expandir' }).click();
    await expect(paymentRow.getByText(/FS-\d{7,}/).first()).toBeVisible({
      timeout: 20_000,
    });

    // Reenviar: 202 "se enviará al generarse" (pending, sin consumer).
    await page.getByTestId(`receipt-resend-${paymentId}`).click();
    await expect(
      page.getByText(/comprobante (reenviado|se enviará)/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('anular conserva el número y muestra ANULADO', async ({
    page,
    consoleApi,
  }) => {
    const slug = `anulado-${uid()}`;
    const orgName = `Org Anulado ${uid()}`;
    const today = toLocalDayString(TZ);

    const org = await consoleApi.create<any>('platformOrg', '/api/platform/organizations', {
      name: orgName,
      slug,
      countryCode: 'VE',
      timezone: TZ,
    });
    const plan = await consoleApi.create<any>('platformPlan', '/api/platform/plans', {
      name: `Plan Anulado ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
    });
    const sub = await consoleApi.create<any>(
      'platformSubscription',
      '/api/platform/subscriptions',
      {
        organizationId: org.id,
        planId: plan.id,
        startDate: today,
        isTrial: false,
        payment: {
          amountPaidCents: 5000,
          currencyPaid: 'USD',
          baseAmountCents: 5000,
          paymentMethod: 'zelle',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: today,
        },
      },
    );
    const payments = await consoleApi.get<Array<{ id: number }>>(
      `/api/platform/subscriptions/${sub.id}/payments`,
    );
    const paymentId = payments[0]!.id;

    await page.goto(`/subscriptions?search=${encodeURIComponent(orgName)}`, {
      waitUntil: 'domcontentloaded',
    });

    const row = page.locator(`[data-testid="subs-row-${sub.id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator(SUBS.rowMenu).click();
    await page.getByRole('menuitem', { name: 'Ver Pagos' }).click();

    const paymentRow = page.locator(`[data-testid="subs-payment-${paymentId}"]`);
    await expect(paymentRow).toBeVisible({ timeout: 20_000 });
    await paymentRow.getByRole('button', { name: 'Acciones de pago' }).click();
    await page.getByRole('menuitem', { name: 'Anular' }).click();

    // El flag ANULADO vive en el bloque expandido, junto al número.
    await paymentRow.getByRole('button', { name: 'Expandir' }).click();
    await expect(paymentRow.getByText(/FS-\d{7,}/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      paymentRow.getByText('Anulado (se conserva el número)').first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// Auditoría del correlativo global (C4): reporte dedicado, espejo del Panel.
test.describe('Console — Reporte de comprobantes FS-N', () => {
  test('navega al reporte, muestra FS-N sin UUID y exporta el CSV', async ({
    page,
    consoleApi,
  }) => {
    const slug = `auditoria-${uid()}`;
    const orgName = `Org Auditoría ${uid()}`;
    // Método único: el universo del reporte es global, así la fila es
    // inequívocamente la de este test (los demás specs crean pagos).
    const method = `auditoria-${uid()}`;
    const today = toLocalDayString(TZ);

    const org = await consoleApi.create<any>('platformOrg', '/api/platform/organizations', {
      name: orgName,
      slug,
      countryCode: 'VE',
      timezone: TZ,
    });
    const plan = await consoleApi.create<any>('platformPlan', '/api/platform/plans', {
      name: `Plan Auditoría ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
    });
    await consoleApi.create<any>('platformSubscription', '/api/platform/subscriptions', {
      organizationId: org.id,
      planId: plan.id,
      startDate: today,
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: method,
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: today,
      },
    });

    // Navegación por el sidebar (como un usuario real), no por URL directa.
    await page.goto('/subscriptions', { waitUntil: 'domcontentloaded' });
    await navigateByClick(
      page,
      page.locator(AUDIT.sidebarLink).first(),
      /\/subscriptions\/receipts/,
    );
    await expect(page.getByTestId('receipts-report')).toBeVisible({ timeout: 30_000 });

    // Filtro por método: solo nuestra fila.
    await page.goto(`/subscriptions/receipts?method=${encodeURIComponent(method)}`, {
      waitUntil: 'domcontentloaded',
    });
    const row = page.locator('tr', { hasText: orgName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('td').first()).toContainText(/FS-\d{7,}/);
    // El UUID técnico del pago nunca se renderiza: solo el número humano.
    const tableText = await page.locator(AUDIT.table).innerText();
    expect(tableText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('receipts-export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe('comprobantes-fs.csv');
    const csv = fs.readFileSync((await download.path())!, 'utf8');
    expect(csv.split('\n')[0]).toContain('comprobante');
    expect(csv).toContain(orgName);
  });
});
