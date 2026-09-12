/**
 * Contrato de cola `receipt.render`: builder validado + type-guard.
 */
import { describe, expect, it } from 'vitest';
import {
  RECEIPT_RENDER_EVENT_TYPE,
  buildReceiptRenderEvent,
  isReceiptRenderEvent,
} from '../../src/documents/receipt-events';

const VALID = {
  paymentId: 42,
  organizationId: 'org-1',
  receiptNumber: 'fit-stack-2026-000045',
};

describe('buildReceiptRenderEvent', () => {
  it('construye con scope panel por defecto', () => {
    expect(buildReceiptRenderEvent(VALID)).toEqual({
      type: 'receipt.render',
      scope: 'panel',
      ...VALID,
    });
    expect(RECEIPT_RENDER_EVENT_TYPE).toBe('receipt.render');
  });

  it.each([
    [{ ...VALID, paymentId: 0 }],
    [{ ...VALID, paymentId: 1.5 }],
    [{ ...VALID, organizationId: '   ' }],
    [{ ...VALID, receiptNumber: 'FS-0000001' }],
    [{ ...VALID, receiptNumber: 'basura' }],
  ])('lanza con input inválido %j', (input) => {
    expect(() => buildReceiptRenderEvent(input)).toThrow();
  });
});

describe('isReceiptRenderEvent', () => {
  it('acepta el evento válido (panel)', () => {
    expect(isReceiptRenderEvent(buildReceiptRenderEvent(VALID))).toBe(true);
  });

  it('scope platform acepta el correlativo global FS-N (C2)', () => {
    const evt = buildReceiptRenderEvent({
      ...VALID,
      scope: 'platform',
      receiptNumber: 'FS-0000001',
    });
    expect(evt.scope).toBe('platform');
    expect(evt.receiptNumber).toBe('FS-0000001');
    // El mismo número NO es válido para panel.
    expect(() =>
      buildReceiptRenderEvent({ ...VALID, scope: 'panel', receiptNumber: 'FS-0000001' }),
    ).toThrow();
  });

  it.each([
    null,
    'receipt.render',
    { type: 'email.payment_receipt', paymentId: 1, organizationId: 'o' },
    { type: 'receipt.render', scope: 'panel', paymentId: '42', organizationId: 'o', receiptNumber: 'n' },
    { type: 'receipt.render', scope: 'otro', paymentId: 1, organizationId: 'o', receiptNumber: 'n' },
  ])('rechaza %j', (v) => {
    expect(isReceiptRenderEvent(v)).toBe(false);
  });
});
