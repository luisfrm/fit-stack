/**
 * Receipt PDF render smoke test (pure: data in → bytes out, no DB).
 *
 * Lives in jobs-worker because @react-pdf/renderer only resolves here.
 * Asserts a valid PDF document; visual fidelity is human-reviewed against
 * the legacy template (apps/api/services/pdf/receipt-pdf.tsx).
 */
import { describe, expect, it } from 'vitest';
import type { ReceiptData } from '@workspace/shared';
import { renderReceiptPdfBytes } from '../src/receipt-pdf';

function sampleReceipt(): ReceiptData {
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
      subtotal: 10000,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 1600 }],
      taxTotal: 1600,
      total: 11600,
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

describe('renderReceiptPdfBytes', () => {
  it('returns non-empty PDF bytes with %PDF header', async () => {
    const bytes = await renderReceiptPdfBytes(sampleReceipt(), 'latam');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  }, 60000);
});
