/**
 * Contrato ReceiptData + checklist pre-PDF.
 */
import { describe, expect, it } from 'vitest';
import {
  checklistPrePdf,
  type ReceiptData,
} from '../../src/documents/receipt-data';

function validReceipt(): ReceiptData {
  return {
    emitter: {
      name: 'Gym Fit Stack',
      legalName: 'Fit Stack C.A.',
      taxId: 'J-12345678-9',
      taxLabel: 'R.I.F.',
      address: 'Caracas',
      countryCode: 'VE',
      currency: 'VES',
    },
    recipient: { name: 'Juan Pérez', documentId: 'V-12345678', docLabel: 'C.I.' },
    document: {
      number: 'fit-stack-2026-000045',
      type: 'receipt',
      label: 'Comprobante de pago',
      issuedAt: '2026-09-11T10:00:00.000Z',
    },
    sale: {
      planName: 'Plan Mensual',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      paymentDate: '2026-09-11T09:00:00.000Z',
    },
    amounts: {
      subtotal: 100,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 16 }],
      taxTotal: 16,
      total: 116,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
    },
    method: {
      name: 'Transferencia',
      maskedDetails: [{ label: 'Referencia', value: '1234••••••12' }],
    },
    footer: {
      disclaimer: ['Este comprobante no constituye una factura fiscal.'],
      generatedBy: 'Generado con FitStack',
    },
    internalPaymentId: 42,
  };
}

describe('checklistPrePdf', () => {
  it('caso feliz → ok', () => {
    expect(checklistPrePdf(validReceipt())).toEqual({ ok: true, errors: [] });
  });

  it('detecta UUID visible en campos', () => {
    const data = validReceipt();
    data.recipient.name = 'Juan 550e8400-e29b-41d4-a716-446655440000';
    const result = checklistPrePdf(data);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('UUID'))).toBe(true);
  });

  it('exige tasa si la moneda difiere de la del emisor', () => {
    const data = validReceipt();
    data.amounts.currencyPaid = 'USD';
    data.amounts.exchangeRateApplied = null;
    const missing = checklistPrePdf(data);
    expect(missing.ok).toBe(false);

    data.amounts.exchangeRateApplied = '36.5';
    expect(checklistPrePdf(data).ok).toBe(true);
  });

  it('detecta total descuadrado y desglose descuadrado', () => {
    const badTotal = validReceipt();
    badTotal.amounts.total = 999;
    expect(checklistPrePdf(badTotal).ok).toBe(false);

    const badLines = validReceipt();
    badLines.amounts.taxDetails = [{ name: 'IVA', rate: 0.16, amount: 1 }];
    expect(checklistPrePdf(badLines).ok).toBe(false);
  });

  it('exige disclaimer y número válido', () => {
    const noDisclaimer = validReceipt();
    noDisclaimer.footer.disclaimer = [];
    expect(checklistPrePdf(noDisclaimer).ok).toBe(false);

    const noNumber = validReceipt();
    noNumber.document.number = '';
    expect(checklistPrePdf(noNumber).ok).toBe(false);
  });

  it('acepta correlativo Console', () => {
    const data = validReceipt();
    data.document.number = 'FS-0000001';
    expect(checklistPrePdf(data).ok).toBe(true);
  });
});
