import { describe, expect, it } from 'vitest';
import { normalizePaymentDetails } from '../../components/payments/payment-detail-row';

describe('normalizePaymentDetails (con enmascarado)', () => {
  it('enmascara valores text/number largos y conserva file íntegro', () => {
    const result = normalizePaymentDetails([
      { label: 'Referencia', value: '123456789012', type: 'text' },
      { label: 'Monto', value: 123456789012, type: 'number' },
      { label: 'Captura', value: 'org/capturas/abc123.png', type: 'file' },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ label: 'Referencia', value: '1234••••••12' });
    expect(result[1]).toMatchObject({ label: 'Monto', value: '1234••••••12' });
    expect(result[2]).toMatchObject({
      label: 'Captura',
      value: 'org/capturas/abc123.png',
      isImage: true,
    });
  });

  it('enmascara valores cortos por completo y detecta keys relativas sin type', () => {
    const result = normalizePaymentDetails([
      { label: 'PIN', value: '1234', type: 'text' },
      { label: 'Evidencia', value: 'org/capturas/abc.png' },
    ]);
    expect(result[0]).toMatchObject({ value: '••••', isImage: false });
    expect(result[1]).toMatchObject({ value: 'org/capturas/abc.png', isImage: true });
  });

  it('enmascara filas legacy con forma de objeto (sin leak)', () => {
    const legacy = { reference: '123456789012' };
    expect(normalizePaymentDetails(legacy)).toHaveLength(1);
    expect(normalizePaymentDetails(legacy)[0]).toMatchObject({
      label: 'REFERENCE',
      value: '1234••••••12',
    });
  });

  it('omite last4, nulos y vacíos en legacy', () => {
    expect(
      normalizePaymentDetails({ last4: '1234', reference: null, note: '' }),
    ).toEqual([]);
  });

  it('null/undefined → vacío', () => {
    expect(normalizePaymentDetails(null)).toEqual([]);
    expect(normalizePaymentDetails(undefined)).toEqual([]);
  });
});
