/**
 * Enmascarado de referencias: parcial visible, `file` intacto.
 */
import { describe, expect, it } from 'vitest';
import { maskPaymentDetails, maskReference } from '../../src/documents/masking';

describe('maskReference', () => {
  it('conserva primeros 4 y últimos 2', () => {
    expect(maskReference('123456789012')).toBe('1234••••••12');
  });

  it('valores cortos se ocultan por completo', () => {
    expect(maskReference('12345')).toBe('•••••');
    expect(maskReference('a')).toBe('•');
  });

  it('vacío/null → "" sin lanzar', () => {
    expect(maskReference('')).toBe('');
    expect(maskReference(null)).toBe('');
    expect(maskReference(undefined)).toBe('');
  });
});

describe('maskPaymentDetails', () => {
  it('enmascara text/number y conserva file como link', () => {
    const result = maskPaymentDetails([
      { label: 'Referencia', value: '123456789012', type: 'text' },
      { label: 'Monto', value: '999999', type: 'number' },
      { label: 'Captura', value: 'https://r2/captura.png', type: 'file' },
    ]);
    expect(result).toEqual([
      { label: 'Referencia', value: '1234••••••12', type: 'text' },
      { label: 'Monto', value: '••••••', type: 'number' },
      { label: 'Captura', value: 'https://r2/captura.png', type: 'file' },
    ]);
  });

  it('tolera filas legacy con forma de objeto y null', () => {
    const legacy = { ref: '123' };
    expect(maskPaymentDetails(legacy)).toBe(legacy);
    expect(maskPaymentDetails(null)).toBeNull();
    expect(maskPaymentDetails(undefined)).toBeUndefined();
  });
});
