/**
 * Gate de etiqueta del documento: 8 combinaciones → solo 1 da 'Factura',
 * y con HAS_FISCAL_HOMOLOGATION=false todo es 'Comprobante de pago'.
 */
import { describe, expect, it } from 'vitest';
import {
  HAS_FISCAL_HOMOLOGATION,
  resolveDocumentLabel,
  type DocumentLabelGateInput,
} from '../../src/documents/document-label-gate';

describe('resolveDocumentLabel', () => {
  it('expone que hoy no hay homologación fiscal (bloquea Factura por construcción)', () => {
    expect(HAS_FISCAL_HOMOLOGATION).toBe(false);
  });

  it.each([
    [{ taxId: undefined, isFormalTaxpayer: undefined, hasFiscalHomologation: undefined }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: undefined, hasFiscalHomologation: undefined }, 'Comprobante de pago'],
    [{ taxId: undefined, isFormalTaxpayer: true, hasFiscalHomologation: undefined }, 'Comprobante de pago'],
    [{ taxId: undefined, isFormalTaxpayer: undefined, hasFiscalHomologation: true }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: true, hasFiscalHomologation: undefined }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: undefined, hasFiscalHomologation: true }, 'Comprobante de pago'],
    [{ taxId: undefined, isFormalTaxpayer: true, hasFiscalHomologation: true }, 'Comprobante de pago'],
    [{ taxId: 'J-123', isFormalTaxpayer: true, hasFiscalHomologation: true }, 'Factura'],
  ] as [DocumentLabelGateInput, string][])('gate %j → %s', (input, expected) => {
    expect(resolveDocumentLabel(input)).toBe(expected);
  });

  it('con las 3 condiciones "casi" (2/3 + default) fuerza Comprobante aunque se pida Factura', () => {
    expect(resolveDocumentLabel({ taxId: 'J-123', isFormalTaxpayer: true })).toBe(
      'Comprobante de pago',
    );
  });

  it('taxId vacío o solo espacios cuenta como ausente', () => {
    expect(
      resolveDocumentLabel({ taxId: '   ', isFormalTaxpayer: true, hasFiscalHomologation: true }),
    ).toBe('Comprobante de pago');
    expect(
      resolveDocumentLabel({ taxId: null, isFormalTaxpayer: true, hasFiscalHomologation: true }),
    ).toBe('Comprobante de pago');
  });

  it('isFormalTaxpayer debe ser true estricto', () => {
    expect(
      resolveDocumentLabel({
        taxId: 'J-123',
        isFormalTaxpayer: undefined,
        hasFiscalHomologation: true,
      }),
    ).toBe('Comprobante de pago');
  });
});
