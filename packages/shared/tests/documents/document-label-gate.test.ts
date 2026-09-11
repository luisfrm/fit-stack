import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LABELS,
  FISCAL_HOMOLOGATION_AVAILABLE,
  resolveDocumentKind,
  resolveDocumentLabel,
} from '../../src/index';

describe('resolveDocumentKind (gate defensivo)', () => {
  const combinations: Array<{
    taxId: string | null;
    isFormalTaxpayer: boolean;
    hasFiscalHomologation: boolean;
  }> = [];
  for (const taxId of ['J-12345678-9', null]) {
    for (const isFormalTaxpayer of [true, false]) {
      for (const hasFiscalHomologation of [true, false]) {
        combinations.push({ taxId, isFormalTaxpayer, hasFiscalHomologation });
      }
    }
  }

  it('evaluates the full 8-combination matrix', () => {
    expect(combinations).toHaveLength(8);
  });

  it('only allows "invoice" when the 3 conditions are met', () => {
    const invoices = combinations.filter(
      (input) => resolveDocumentKind(input).documentType === 'invoice',
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toEqual({
      taxId: 'J-12345678-9',
      isFormalTaxpayer: true,
      hasFiscalHomologation: true,
    });
  });

  it('falls back to "receipt" when any condition is missing and lists it', () => {
    const result = resolveDocumentKind({
      taxId: '',
      isFormalTaxpayer: false,
      hasFiscalHomologation: false,
    });
    expect(result.documentType).toBe('receipt');
    expect(result.label).toBe(DOCUMENT_LABELS.receipt);
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining(['taxId', 'isFormalTaxpayer', 'fiscalMechanism']),
    );
  });

  it('resolveDocumentLabel returns the allowed label, never a requested one', () => {
    expect(
      resolveDocumentLabel({ taxId: 'X', isFormalTaxpayer: true, hasFiscalHomologation: false }),
    ).toBe('Comprobante de pago');
    expect(
      resolveDocumentLabel({ taxId: 'X', isFormalTaxpayer: true, hasFiscalHomologation: true }),
    ).toBe('Factura');
  });

  it('FISCAL_HOMOLOGATION_AVAILABLE is explicitly false today', () => {
    expect(FISCAL_HOMOLOGATION_AVAILABLE).toBe(false);
  });
});
