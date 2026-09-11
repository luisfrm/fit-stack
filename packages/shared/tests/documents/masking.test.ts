import { describe, expect, it } from 'vitest';
import { maskPaymentDetails, maskReference } from '../../src/index';

describe('maskReference', () => {
  it('returns empty for empty input', () => {
    expect(maskReference('')).toBe('');
  });

  it('fully masks values shorter than or equal to the visible margin', () => {
    expect(maskReference('12')).toBe('**');
    expect(maskReference('1234')).toBe('****');
  });

  it('keeps only the last 4 characters visible', () => {
    expect(maskReference('123456789')).toBe('*****6789');
    expect(maskReference('12345678', { visibleLast: 4 })).toBe('****5678');
  });

  it('respects a custom visible margin', () => {
    expect(maskReference('12345678', { visibleLast: 2 })).toBe('******78');
    expect(maskReference('12345678', { visibleLast: 0 })).toBe('********');
  });
});

describe('maskPaymentDetails', () => {
  it('masks sensitive text/number items and leaves captions (file) untouched', () => {
    const result = maskPaymentDetails([
      { label: 'Referencia', value: '1234567890', type: 'text' },
      { label: 'Monto', value: '50.00', type: 'number' },
      { label: 'Cuenta', value: '0102030405', type: 'number' },
      { label: 'Comprobante', value: 'https://r2.example/cap.png', type: 'file' },
    ]);

    expect(result).toEqual([
      { label: 'Referencia', value: '******7890', type: 'text' },
      { label: 'Monto', value: '50.00', type: 'number' },
      { label: 'Cuenta', value: '******0405', type: 'number' },
      { label: 'Comprobante', value: 'https://r2.example/cap.png', type: 'file' },
    ]);
  });

  it('masks sensitive keys of the legacy object shape (keeps last4)', () => {
    const result = maskPaymentDetails({
      card: '4111111111111111',
      last4: '1111',
      bank: 'Banco Central',
    });

    expect(result).toEqual({
      card: '************1111',
      last4: '1111',
      bank: 'Banco Central',
    });
  });

  it('returns null for null/undefined', () => {
    expect(maskPaymentDetails(null)).toBeNull();
    expect(maskPaymentDetails(undefined)).toBeNull();
  });
});
