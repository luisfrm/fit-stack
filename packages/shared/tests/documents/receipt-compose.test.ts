/**
 * Builder puro de ReceiptData: fiscal sobre lo persistido, masking,
 * snapshots congelados. Sin recalcular impuestos.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReceiptDataFromComposed,
  type ComposeReceiptInput,
} from '../../src/documents/receipt-compose';
import { checklistPrePdf } from '../../src/documents/receipt-data';

function validInput(): ComposeReceiptInput {
  return {
    receiptNumber: 'fit-stack-2026-000045',
    documentType: 'receipt',
    issuedAt: '2026-09-11T10:00:00.000Z',
    payment: {
      id: 42,
      amountPaid: 11600,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
      paymentMethod: 'Transferencia',
      paymentMethodDetails: [{ label: 'Referencia', value: '123456789012', type: 'text' }],
      paymentDate: '2026-09-11T09:00:00.000Z',
      subtotal: 10000,
      taxTotal: 1600,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 1600 }],
      receiptNumber: 'fit-stack-2026-000045',
      planSnapshotName: 'Plan Mensual',
    },
    organization: {
      name: 'Gym Fit Stack',
      legalName: 'Fit Stack C.A.',
      taxId: 'J-12345678-9',
      address: 'Caracas',
      countryCode: 'VE',
      primaryCurrency: 'VES',
    },
    member: { firstName: 'Juan', lastName: 'Pérez', documentId: 'V-12345678' },
    subscription: { startDate: '2026-09-01', endDate: '2026-09-30' },
  };
}

describe('buildReceiptDataFromComposed', () => {
  it('arma el contrato completo y pasa el checklist', () => {
    const data = buildReceiptDataFromComposed(validInput());
    expect(data.document.number).toBe('fit-stack-2026-000045');
    expect(data.document.label).toBe('Comprobante de pago');
    expect(data.amounts.total).toBe(11600);
    expect(data.sale.planName).toBe('Plan Mensual');
    expect(data.method.maskedDetails).toEqual([
      { label: 'Referencia', value: '1234••••••12' },
    ]);
    expect(data.internalPaymentId).toBe(42);
    expect(checklistPrePdf(data)).toEqual({ ok: true, errors: [] });
  });

  it('sin impuestos persistidos lanza (no inventa)', () => {
    const input = validInput();
    input.payment.subtotal = null;
    expect(() => buildReceiptDataFromComposed(input)).toThrow(/no persistidos/);
  });

  it('trial $0 sin desglose: amounts en cero', () => {
    const input = validInput();
    input.payment.amountPaid = 0;
    input.payment.subtotal = 0;
    input.payment.taxTotal = 0;
    input.payment.taxDetails = [];
    const data = buildReceiptDataFromComposed(input);
    expect(data.amounts.total).toBe(0);
    expect(checklistPrePdf(data).ok).toBe(true);
  });

  it('miembro ausente no rompe (mostrador)', () => {
    const input = validInput();
    input.member = null;
    expect(buildReceiptDataFromComposed(input).recipient.name).toBe('Miembro');
  });
});
