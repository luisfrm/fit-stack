/**
 * Perfil fiscal: defaults del país + override de la org, sin hardcode.
 */
import { describe, expect, it } from 'vitest';
import {
  FiscalConfigSchema,
  parseRateValue,
  resolveFiscalProfile,
} from '../../src/documents/fiscal-profile';

describe('parseRateValue', () => {
  it.each([
    ['16%', 0.16],
    ['16', 0.16],
    ['0.16', 0.16],
    [' 19 % ', 0.19],
    ['3%', 0.03],
  ])('"%s" → %s', (input, expected) => {
    expect(parseRateValue(input)).toBeCloseTo(expected, 10);
  });

  it.each(['', 'abc', '%', '-5%'])('lanza con tasa inválida "%s" (sin fallback)', (input) => {
    expect(() => parseRateValue(input)).toThrow();
  });
});

describe('resolveFiscalProfile', () => {
  it('VE trae IVA 16% + IGTF condicional', () => {
    const profile = resolveFiscalProfile('VE');
    expect(profile.taxes).toContainEqual({ name: 'IVA', rate: 0.16, enabled: true });
    expect(profile.taxes).toContainEqual({
      name: 'IGTF',
      rate: 0.03,
      enabled: true,
      condition: "payment_currency !== 'VES'",
    });
    expect(profile.taxLabel).toBe('R.I.F.');
    expect(profile.docLabel).toBe('C.I.');
    expect(profile.disclaimer.length).toBeGreaterThan(0);
    expect(profile.isFormalTaxpayer).toBe(false);
  });

  it('US no trae impuestos', () => {
    expect(resolveFiscalProfile('US').taxes).toEqual([]);
  });

  it('la org puede apagar un impuesto y cambiar una tasa', () => {
    const profile = resolveFiscalProfile('VE', {
      taxes: [
        { name: 'IVA', rate: 0.16, enabled: false },
        { name: 'IGTF', rate: 0.05, enabled: true },
      ],
    });
    expect(profile.taxes.find((t) => t.name === 'IVA')?.enabled).toBe(false);
    expect(profile.taxes.find((t) => t.name === 'IGTF')?.rate).toBe(0.05);
  });

  it('la org puede fijar disclaimer custom e isFormalTaxpayer', () => {
    const profile = resolveFiscalProfile('CO', {
      disclaimerOverride: ['Aviso custom'],
      isFormalTaxpayer: true,
    });
    expect(profile.disclaimer).toEqual(['Aviso custom']);
    expect(profile.isFormalTaxpayer).toBe(true);
  });

  it('impuestos desconocidos en el override se ignoran', () => {
    const profile = resolveFiscalProfile('PE', {
      taxes: [{ name: 'INVENTADO', rate: 0.5, enabled: true }],
    });
    expect(profile.taxes.map((t) => t.name)).toEqual(['IGV']);
  });

  it('countryCode desconocido lanza (sin fallback silencioso)', () => {
    expect(() => resolveFiscalProfile('XX')).toThrow();
  });

  it('fiscalConfig null se trata como ausente (jsonb nullable)', () => {
    const profile = resolveFiscalProfile('VE', null);
    expect(profile.taxes).toContainEqual({ name: 'IVA', rate: 0.16, enabled: true });
    expect(profile.isFormalTaxpayer).toBe(false);
  });

  it('fiscalConfig inválido lanza (tasa > 1, schema estricto)', () => {
    expect(() =>
      resolveFiscalProfile('VE', { taxes: [{ name: 'IVA', rate: 5, enabled: true }] }),
    ).toThrow();
    expect(() => FiscalConfigSchema.parse({ otroCampo: 1 })).toThrow();
  });
});
