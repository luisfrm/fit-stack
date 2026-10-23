import { test, expect } from '../fixtures';
import { uid, uniqueEmail } from '../helpers/api';
import { clickMenuItem } from '../helpers/interactions';
import { PANEL_RECEIPT_NUMBER_PATTERN } from '../helpers/receipts';
import { SELECTORS } from '../helpers/selectors';
import { TEST_ORG } from '../helpers/test-tenant';
import { addLocalDays, toLocalDayString } from '@workspace/shared';
import type { IPaginatedResult, ISubscription } from '@workspace/shared';

// The render consumer (jobs-worker) does not run in E2E: after validating, the
// receipt ends up numbered with a pending PDF. The spec asserts the
// deterministic part — correlative number visible without UUID, statuses and
// resend — and tolerates `ready` if a manual jobs-worker rendered it mid-test.
test.describe('Panel — Comprobante de pago', () => {
  test('abrir comprobante muestra número correlativo sin UUID y permite reenviar', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('receipt');
    const lastName = `Recibo ${uid()}`;
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    // Fixture: plan → client with email → subscription with a `validated` payment
    // (step 1 assigns the number in the POST itself).
    const plan = await panelApi.create<any>('plan', '/api/plans', {
      name: `Plan Recibo ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      features: ['Acceso'],
      isPopular: false,
      isActive: true,
      isVisibleOnSite: true,
    });
    const member = await panelApi.create<any>('member', '/api/members', {
      firstName: 'Comprobante',
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
        paymentMethod: 'transferencia',
        paymentMethodDetails: [
          { label: 'Referencia', value: '123456789012', type: 'text' },
        ],
        status: 'validated',
        paymentDate: today,
      },
    });

    await page.goto(`/payments?search=${encodeURIComponent(lastName)}`, {
      waitUntil: 'domcontentloaded',
    });

    const row = page.locator('table tbody tr', { hasText: lastName }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    // With a number assigned the action is reprint (it tests the 3B-1 select).
    await clickMenuItem(page, row.getByRole('button'), /reimprimir comprobante/i);

    const dialog = page.locator(SELECTORS.common.modal);
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // Human correlative number, never the technical UUID.
    await expect(dialog.getByText(PANEL_RECEIPT_NUMBER_PATTERN).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText('Operación #')).toHaveCount(0);

    // `pending` (no consumer) or `ready`: both show the number.
    const pendingNote = dialog.getByText('PDF en preparación');
    const downloadBtn = dialog.getByRole('button', { name: 'PDF' });
    await expect(pendingNote.or(downloadBtn)).toBeVisible({ timeout: 20_000 });

    // Resend: 202 "se enviará al generarse" (pending) or an email with an
    // attachment (ready). Both are success toasts.
    await dialog.getByRole('button', { name: 'Enviar' }).click();
    await expect(
      page.getByText(/Comprobante (enviado|en preparación)/).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('anular conserva el número y muestra Anulado sin UUID', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('receipt-void');
    const lastName = `Anulado ${uid()}`;
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    const plan = await panelApi.create<any>('plan', '/api/plans', {
      name: `Plan Anulado ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      features: ['Acceso'],
      isPopular: false,
      isActive: true,
      isVisibleOnSite: true,
    });
    const member = await panelApi.create<any>('member', '/api/members', {
      firstName: 'Comprobante',
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
        paymentMethod: 'transferencia',
        paymentMethodDetails: [
          { label: 'Referencia', value: '123456789012', type: 'text' },
        ],
        status: 'validated',
        paymentDate: today,
      },
    });

    // paymentId from the listing (ISubscription includes it) and voiding.
    const list = await panelApi.get<IPaginatedResult<ISubscription>>(
      '/api/subscriptions',
      { search: lastName },
    );
    const found = list.data.find((s) => s.memberName?.includes(lastName));
    expect(found?.paymentId).toBeDefined();
    await panelApi.patch(`/api/payments/${found!.paymentId}/status`, {
      status: 'voided',
      voidReason: 'Anulación del fixture E2E',
    });

    await page.goto(`/payments?search=${encodeURIComponent(lastName)}`, {
      waitUntil: 'domcontentloaded',
    });

    const row = page.locator('table tbody tr', { hasText: lastName }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    // Status badge in the table (deterministic: it does not depend on the PDF).
    await expect(row.getByText('Anulado').first()).toBeVisible({
      timeout: 20_000,
    });
    await clickMenuItem(page, row.getByRole('button'), /ver comprobante \(anulado\)/i);

    const dialog = page.locator(SELECTORS.common.modal);
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The number is kept after voiding; never the technical UUID.
    await expect(dialog.getByText(PANEL_RECEIPT_NUMBER_PATTERN).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText('Operación #')).toHaveCount(0);
  });
});
