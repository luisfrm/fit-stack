/**
 * Document label gate: with `HAS_FISCAL_HOMOLOGATION = false` every
 * combination yields 'Comprobante de pago'. The gate accepts no override.
 */
import { describe, expect, it } from 'vitest';
import {
  HAS_FISCAL_HOMOLOGATION,
  resolveDocumentLabel,
  type DocumentLabelGateInput,
} from '../../src/documents/document-label-gate';

describe('resolveDocumentLabel', () => {
  it('exposes that there is no fiscal homologation today (Factura blocked by construction)', () => {
    expect(HAS_FISCAL_HOMOLOGATION).toBe(false);
  });

  it.each([
    [{ taxId: undefined, isFormalTaxpayer: undefined }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: undefined }, 'Comprobante de pago'],
    [{ taxId: undefined, isFormalTaxpayer: true }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: true }, 'Comprobante de pago'],
  ] as [DocumentLabelGateInput, string][])('gate %j → %s', (input, expected) => {
    expect(resolveDocumentLabel(input)).toBe(expected);
  });

  it('an empty taxId or whitespace only counts as missing', () => {
    expect(resolveDocumentLabel({ taxId: '   ', isFormalTaxpayer: true })).toBe(
      'Comprobante de pago',
    );
    expect(resolveDocumentLabel({ taxId: null, isFormalTaxpayer: true })).toBe(
      'Comprobante de pago',
    );
    expect(resolveDocumentLabel({ taxId: '', isFormalTaxpayer: true })).toBe(
      'Comprobante de pago',
    );
  });

  it('isFormalTaxpayer must be strictly true', () => {
    expect(resolveDocumentLabel({ taxId: 'J-123' })).toBe('Comprobante de pago');
    expect(resolveDocumentLabel({ taxId: 'J-123', isFormalTaxpayer: false })).toBe(
      'Comprobante de pago',
    );
  });
});
