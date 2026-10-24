/**
 * RD-159 — step 2 must NEVER render the emission PDF for a voided payment.
 *
 * The void writes `status = 'voided'` first and `receipt_voided` second; if the
 * second write is lost, `renderReceipt` still has to treat the receipt as
 * voided (otherwise it renders an unstamped document and persists it under the
 * `-anulado.pdf` key, which the sweep never regenerates).
 *
 * The profile is a stub (no DB): this freezes the VARIANT chosen by the core.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptData } from '@workspace/shared';
import {
  renderReceipt,
  type RenderPaymentRow,
  type RenderProfile,
  type RenderRows,
} from '../src/handlers/render-profile';

// The PDF engine is only dynamically imported on the render path.
vi.mock('../src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}));

const R2_KEY = 'receipts/platform/2026/FS-0000001-anulado.pdf';

function receiptData(): ReceiptData {
  return {
    emitter: {
      name: 'FitStack',
      legalName: 'FitStack C.A.',
      taxId: 'J-12345678-9',
      taxLabel: 'R.I.F.',
      address: 'Caracas',
      countryCode: 'VE',
      currency: 'USD',
    },
    recipient: {
      kind: 'organization',
      name: 'Gym Demo',
      documentId: 'J-99999999-9',
      docLabel: 'R.I.F.',
      address: null,
    },
    document: {
      number: 'FS-0000001',
      type: 'receipt',
      label: 'Comprobante de pago',
      issuedAt: '2026-10-01T10:00:00.000Z',
    },
    sale: {
      planName: 'Plan SaaS',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
      paymentDate: '2026-10-01T10:00:00.000Z',
    },
    amounts: {
      subtotal: 5000,
      taxDetails: [],
      taxTotal: 0,
      total: 5000,
      currencyPaid: 'USD',
      baseCurrency: 'USD',
      exchangeRateApplied: null,
      baseTotal: null,
    },
    method: { name: 'Zelle' },
    footer: { disclaimer: ['Documento no fiscal.'], generatedBy: 'Generado con FitStack' },
    timezone: 'America/Caracas',
    voided: true,
    internalPaymentId: 42,
  };
}

function paymentRow(overrides: Partial<RenderPaymentRow> = {}): RenderPaymentRow {
  return {
    id: 42,
    receiptNumber: 'FS-0000001',
    receiptPdfKey: 'receipts/platform/2026/FS-0000001.pdf',
    receiptVoided: false,
    receiptVoidedPdfKey: null,
    receiptNotifiedAt: null,
    receiptIssuedAt: new Date('2026-10-01T10:00:00.000Z'),
    status: 'voided',
    ...overrides,
  };
}

const completePdfMock = vi.fn(async () => true);
const markNotifiedMock = vi.fn(async () => true);
const putMock = vi.fn(async () => undefined);

function buildProfile(rows: RenderRows): RenderProfile<RenderRows> {
  return {
    issuerLabel: 'pago SaaS',
    notFoundContext: () => '',
    load: async () => rows,
    compose: () => receiptData(),
    resolveKey: (_rows, _number, _issuedAt, variant) =>
      variant === 'voided' ? R2_KEY : 'receipts/platform/2026/FS-0000001.pdf',
    completePdf: completePdfMock,
    markNotified: markNotifiedMock,
    clearNotified: async () => undefined,
    buildEmailEvent: () => {
      throw new Error('a voided receipt never notifies');
    },
  };
}

const event = {
  type: 'receipt.render' as const,
  scope: 'platform' as const,
  paymentId: 42,
  organizationId: 'org-1',
  receiptNumber: 'FS-0000001',
};

const env = {
  FILES_BUCKET: { put: putMock } as unknown as R2Bucket,
  TASK_QUEUE: { send: vi.fn() } as unknown as Queue,
};

beforeEach(() => {
  completePdfMock.mockClear().mockResolvedValue(true);
  markNotifiedMock.mockClear().mockResolvedValue(true);
  putMock.mockClear();
});

describe('renderReceipt — voided by STATUS with the flag lost (RD-159)', () => {
  it('renders the VOIDED variant when only the status says voided', async () => {
    const rows: RenderRows = {
      payment: paymentRow({ status: 'voided', receiptVoided: false }),
      organization: { currencyFormat: 'latam' },
    };

    const result = await renderReceipt(buildProfile(rows), env, event);

    expect(result).toBe('completed');
    // The stamped variant wins, never the emission one.
    expect(completePdfMock).toHaveBeenCalledWith(rows, 'voided', R2_KEY);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(markNotifiedMock).not.toHaveBeenCalled();
  });

  it('does not render again when the sealed PDF already exists', async () => {
    const rows: RenderRows = {
      payment: paymentRow({
        status: 'voided',
        receiptVoided: false,
        receiptVoidedPdfKey: R2_KEY,
        receiptNotifiedAt: new Date('2026-10-01T11:00:00.000Z'),
      }),
      organization: { currencyFormat: 'latam' },
    };

    const result = await renderReceipt(buildProfile(rows), env, event);

    expect(result).toBe('already-done');
    expect(putMock).not.toHaveBeenCalled();
    expect(completePdfMock).not.toHaveBeenCalled();
    expect(markNotifiedMock).not.toHaveBeenCalled();
  });
});
