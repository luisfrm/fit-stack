import { describe, expect, it } from 'vitest';
import { checklistPrePdf } from '../../src/index';
import type { IReceiptData } from '../../src/index';

function validReceipt(overrides: Partial<IReceiptData> = {}): IReceiptData {
  return {
    issuer: {
      name: 'Fit Gym',
      legalName: 'Fit Gym C.A.',
      taxId: 'J-12345678-9',
      taxLabel: 'R.I.F.',
      address: 'Av. Siempre Viva 1',
      logoUrl: null,
    },
    recipient: {
      name: 'Ana Pérez',
      documentId: 'V-12345678',
      documentLabel: 'C.I.',
      email: 'ana@example.com',
      phone: null,
    },
    identification: {
      number: 'mi-gym-2026-000001',
      documentType: 'receipt',
      documentLabel: 'Comprobante de pago',
      issuedAt: '2026-09-10T12:00:00.000Z',
    },
    line: {
      planName: 'Mensual',
      planPrice: 50,
      planCurrency: 'USD',
      periodStart: '2026-09-10T00:00:00.000Z',
      periodEnd: '2026-10-10T00:00:00.000Z',
    },
    amounts: {
      subtotal: 50,
      taxDetails: [],
      taxTotal: 0,
      amountPaid: 50,
      currencyPaid: 'USD',
      primaryCurrency: 'USD',
      exchangeRateApplied: null,
      convertedAmount: null,
    },
    payment: {
      method: 'transfer',
      reference: '******7890',
      paymentDate: '2026-09-10T12:00:00.000Z',
    },
    legal: {
      disclaimer: ['Este comprobante no constituye una factura fiscal digital.'],
      issuerLine: 'Generado con FitStack',
    },
    ...overrides,
  };
}

describe('checklistPrePdf', () => {
  it('passes a well-formed receipt', () => {
    const result = checklistPrePdf(validReceipt());
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags a missing number', () => {
    const data = validReceipt();
    data.identification.number = '';
    const result = checklistPrePdf(data);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toMatch(/número correlativo/i);
  });

  it('flags a raw technical id used as number', () => {
    const data = validReceipt();
    data.identification.number = '123456';
    const result = checklistPrePdf(data);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toMatch(/id técnico/i);
  });

  it('flags a missing legal disclaimer', () => {
    const data = validReceipt();
    data.legal.disclaimer = [];
    const result = checklistPrePdf(data);
    expect(result.violations.join(' ')).toMatch(/descargo legal/i);
  });

  it('flags a foreign currency without exchange rate or converted amount', () => {
    const data = validReceipt();
    data.amounts.currencyPaid = 'VES';
    data.amounts.primaryCurrency = 'USD';
    const result = checklistPrePdf(data);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toMatch(/tasa aplicada/i);
    expect(result.violations.join(' ')).toMatch(/equivalente convertido/i);
  });

  it('passes a foreign-currency receipt that shows rate + converted amount', () => {
    const data = validReceipt();
    data.amounts.currencyPaid = 'VES';
    data.amounts.primaryCurrency = 'USD';
    data.amounts.exchangeRateApplied = '36.5';
    data.amounts.convertedAmount = 1.37;
    expect(checklistPrePdf(data).ok).toBe(true);
  });

  it('flags a UUID visible anywhere in the document', () => {
    const data = validReceipt();
    data.payment.reference = 'pago 0f8fad5b-d9cb-469f-a165-70867728950e';
    const result = checklistPrePdf(data);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toMatch(/UUID/i);
  });
});
