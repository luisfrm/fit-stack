import { test, expect } from '../fixtures';
import { uid, uniqueEmail } from '../helpers/api';
import { SELECTORS } from '../helpers/selectors';
import { TEST_ORG } from '../helpers/test-tenant';
import { addLocalDays, toLocalDayString } from '@workspace/shared';

// El consumer de renders (jobs-worker) no corre en E2E: tras validar, el
// comprobante queda numerado con PDF pendiente. El spec aserta lo
// determinista — número correlativo visible sin UUID, estados y reenvío —
// y tolera `ready` si un jobs-worker manual lo renderizó a mitad del test.
test.describe('Panel — Comprobante de pago', () => {
  test('abrir comprobante muestra número correlativo sin UUID y permite reenviar', async ({
    page,
    panelApi,
  }) => {
    const email = uniqueEmail('receipt');
    const lastName = `Recibo ${uid()}`;
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);

    // Fixture: plan → cliente con email → suscripción con pago `validated`
    // (el paso 1 asigna el número en el propio POST).
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
    await row.getByRole('button').click();
    // Con número asignado la acción es reimpresión (prueba el select 3B-1).
    await page.getByRole('menuitem', { name: /reimprimir comprobante/i }).click();

    const dialog = page.locator(SELECTORS.common.modal);
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // Número correlativo humano, nunca el UUID técnico.
    await expect(dialog.getByText(/e2e-suite-\d{4}-\d+/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText('Operación #')).toHaveCount(0);

    // `pending` (sin consumer) o `ready`: ambos muestran el número.
    const pendingNote = dialog.getByText('PDF en preparación');
    const downloadBtn = dialog.getByRole('button', { name: 'PDF' });
    await expect(pendingNote.or(downloadBtn)).toBeVisible({ timeout: 20_000 });

    // Reenviar: 202 "se enviará al generarse" (pending) o email con
    // adjunto (ready). Ambos son toast de éxito.
    await dialog.getByRole('button', { name: 'Enviar' }).click();
    await expect(
      page.getByText(/Comprobante (enviado|en preparación)/).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
