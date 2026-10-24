import fs from 'node:fs';
import type { Download } from '@playwright/test';
import { test, expect } from '../fixtures';
import { uid } from '../helpers/api';
import { clickMenuItem } from '../helpers/interactions';
import { navigateByClick } from '../helpers/nav';
import { CONSOLE_RECEIPT_NUMBER_PATTERN } from '../helpers/receipts';
import { SELECTORS } from '../helpers/selectors';
import { TEST_PLATFORM } from '../helpers/test-tenant';
import { toLocalDayString } from '@workspace/shared';

const SUBS = SELECTORS.consoleSubscriptions;
const AUDIT = SELECTORS.consoleReceipts;
const TZ = 'America/Caracas';

// The render consumer (jobs-worker) does not run in E2E: after validating, the
// receipt ends up numbered with a pending PDF. The spec asserts the
// deterministic part — global number visible without UUID, statuses and resend.
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
    // Owners for the resend dedupe (the processing payment brings no payer):
    // links to the existing platform owner, without creating leftover users.
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
        payment: {
          currencyPaid: 'USD',
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
    // The menu trigger carries the class (no custom trigger in the table).
    await clickMenuItem(page, row.locator(SUBS.rowMenu), 'Ver Pagos');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const paymentRow = page.locator(`[data-testid="subs-payment-${paymentId}"]`);
    await expect(paymentRow).toBeVisible({ timeout: 20_000 });
    await clickMenuItem(
      page,
      paymentRow.getByRole('button', { name: 'Acciones de pago' }),
      'Marcar como Validado',
    );

    // After approving, step 1 numbers it: expanding the row shows the FS-N.
    await paymentRow.getByRole('button', { name: 'Expandir' }).click();
    await expect(paymentRow.getByText(CONSOLE_RECEIPT_NUMBER_PATTERN).first()).toBeVisible({
      timeout: 20_000,
    });

    // Resend: 202 "se enviará al generarse" (pending, no consumer).
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
    });
    const sub = await consoleApi.create<any>(
      'platformSubscription',
      '/api/platform/subscriptions',
      {
        organizationId: org.id,
        planId: plan.id,
        startDate: today,
        payment: {
          currencyPaid: 'USD',
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
    await clickMenuItem(page, row.locator(SUBS.rowMenu), 'Ver Pagos');

    const paymentRow = page.locator(`[data-testid="subs-payment-${paymentId}"]`);
    await expect(paymentRow).toBeVisible({ timeout: 20_000 });
    await clickMenuItem(
      page,
      paymentRow.getByRole('button', { name: 'Acciones de pago' }),
      'Anular',
    );

    // RD-163: an annulment asks the operator for the reason (the suggestion is
    // editable); the mutation waits for non-blank text.
    const reasonInput = page.getByTestId('reason-prompt-input');
    await expect(reasonInput).toBeVisible({ timeout: 10_000 });
    await reasonInput.fill('Cobro duplicado (E2E)');
    await page.getByTestId('reason-prompt-confirm').click();

    // The ANULADO flag lives in the expanded block, next to the number.
    await paymentRow.getByRole('button', { name: 'Expandir' }).click();
    await expect(paymentRow.getByText(CONSOLE_RECEIPT_NUMBER_PATTERN).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      paymentRow.getByText('Anulado (se conserva el número)').first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// Audit of the global correlative: dedicated report, mirror of the Panel.
test.describe('Console — Reporte de comprobantes FS-N', () => {
  test('navega al reporte, muestra FS-N sin UUID y exporta el CSV', async ({
    page,
    consoleApi,
  }) => {
    const slug = `auditoria-${uid()}`;
    const orgName = `Org Auditoría ${uid()}`;
    // Unique method: the universe of the report is global, so the row is
    // unambiguously the one of this test (the other specs create payments).
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
    });
    await consoleApi.create<any>('platformSubscription', '/api/platform/subscriptions', {
      organizationId: org.id,
      planId: plan.id,
      startDate: today,
      payment: {
        currencyPaid: 'USD',
        paymentMethod: method,
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: today,
      },
    });

    // Navigation through the sidebar (like a real user), not by direct URL.
    await page.goto('/subscriptions', { waitUntil: 'domcontentloaded' });
    await navigateByClick(
      page,
      page.locator(AUDIT.sidebarLink).first(),
      /\/subscriptions\/receipts/,
    );
    await expect(page.getByTestId('receipts-report')).toBeVisible({ timeout: 30_000 });

    // Filter by method: only our row.
    await page.goto(`/subscriptions/receipts?method=${encodeURIComponent(method)}`, {
      waitUntil: 'domcontentloaded',
    });
    const row = page.locator('tr', { hasText: orgName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('td').first()).toContainText(CONSOLE_RECEIPT_NUMBER_PATTERN);
    // The technical UUID of the payment is never rendered: only the human number.
    const tableText = await page.locator(AUDIT.table).innerText();
    expect(tableText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);

    // Retry: if the click lands before client hydration the onClick never runs
    // and there is no download (same race as the rest of the suite).
    let download: Download | null = null;
    for (let attempt = 0; attempt < 3 && !download; attempt++) {
      const downloadPromise = page
        .waitForEvent('download', { timeout: 15_000 })
        .catch(() => null);
      await page.getByTestId('receipts-export-csv').click();
      download = await downloadPromise;
    }
    expect(download, 'la exportación CSV debe descargar el archivo').toBeTruthy();
    expect(download!.suggestedFilename()).toBe('comprobantes-fs.csv');
    const csv = fs.readFileSync((await download!.path())!, 'utf8');
    expect(csv.split('\n')[0]).toContain('comprobante');
    expect(csv).toContain(orgName);
  });
});
