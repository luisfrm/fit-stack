/**
 * Perfil fiscal: defaults del país + override de la org, sin hardcode.
 * C2: los impuestos solo se activan si el emisor DECLARÓ ser contribuyente
 * formal, y los condicionales (IGTF) además exigen confirmación explícita.
 */
import { describe, expect, it } from 'vitest';
import {
  FiscalConfigSchema,
  findFiscalWriteViolation,
  parseRateValue,
  previewReceiptTaxes,
  resolveFiscalProfile,
} from '../../src/documents/fiscal-profile';

/** Perfil VE de un contribuyente formal con IGTF confirmado. */
const VE_FORMAL = {
  isFormalTaxpayer: true,
  confirmedTaxes: ['IGTF'],
  taxes: [
    { name: 'IVA', rate: 0.16, enabled: true },
    { name: 'IGTF', rate: 0.03, enabled: true },
  ],
};

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
  it('VE sin declaración: TODOS los impuestos apagados (nunca afirmar IVA ajeno)', () => {
    const profile = resolveFiscalProfile('VE');
    expect(profile.isFormalTaxpayer).toBe(false);
    expect(profile.taxes).toContainEqual({ name: 'IVA', rate: 0.16, enabled: false });
    expect(profile.taxes).toContainEqual({
      name: 'IGTF',
      rate: 0.03,
      enabled: false,
      condition: "payment_currency !== 'VES'",
      basis: 'gross_first',
      requiresConfirmation: true,
    });
    expect(profile.taxLabel).toBe('R.I.F.');
    expect(profile.docLabel).toBe('C.I.');
    expect(profile.disclaimer.length).toBeGreaterThan(0);
  });

  it('VE formal: IVA se enciende; IGTF sigue apagado por falta de confirmación', () => {
    const profile = resolveFiscalProfile('VE', { isFormalTaxpayer: true });
    expect(profile.isFormalTaxpayer).toBe(true);
    expect(profile.taxes.find((t) => t.name === 'IVA')?.enabled).toBe(true);
    expect(profile.taxes.find((t) => t.name === 'IGTF')?.enabled).toBe(false);
  });

  it('VE formal + IGTF confirmado y activado: se aplica con basis gross_first', () => {
    const profile = resolveFiscalProfile('VE', VE_FORMAL);
    expect(profile.taxes.find((t) => t.name === 'IGTF')).toMatchObject({
      enabled: true,
      rate: 0.03,
      basis: 'gross_first',
    });
  });

  it('IGTF sin confirmar NO se aplica aunque `enabled: true` (fail-closed D2)', () => {
    const profile = resolveFiscalProfile('VE', {
      isFormalTaxpayer: true,
      taxes: [{ name: 'IGTF', rate: 0.03, enabled: true }],
    });
    expect(profile.taxes.find((t) => t.name === 'IGTF')?.enabled).toBe(false);
  });

  it('un no-contribuyente no puede activar impuestos desde el override (normalización)', () => {
    const profile = resolveFiscalProfile('VE', {
      taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
    });
    expect(profile.isFormalTaxpayer).toBe(false);
    expect(profile.taxes.every((t) => !t.enabled)).toBe(true);
  });

  it('US no trae impuestos', () => {
    expect(resolveFiscalProfile('US').taxes).toEqual([]);
    expect(resolveFiscalProfile('US', { isFormalTaxpayer: true }).taxes).toEqual([]);
  });

  it('el formal puede APAGAR un impuesto y cambiar una tasa (el override solo reduce)', () => {
    const profile = resolveFiscalProfile('VE', {
      isFormalTaxpayer: true,
      taxes: [
        { name: 'IVA', rate: 0, enabled: false },
        { name: 'IGTF', rate: 0.05, enabled: false },
      ],
    });
    expect(profile.taxes.find((t) => t.name === 'IVA')?.enabled).toBe(false);
    expect(profile.taxes.find((t) => t.name === 'IGTF')?.rate).toBe(0.05);
    expect(profile.taxes.every((t) => !t.enabled)).toBe(true);
  });

  it('la org puede fijar disclaimer custom e isFormalTaxpayer', () => {
    const profile = resolveFiscalProfile('CO', {
      disclaimerOverride: ['Aviso custom'],
      isFormalTaxpayer: true,
    });
    expect(profile.disclaimer).toEqual(['Aviso custom']);
    expect(profile.isFormalTaxpayer).toBe(true);
    expect(profile.taxes.find((t) => t.name === 'IVA')?.enabled).toBe(true);
  });

  it('impuestos desconocidos en el override se ignoran', () => {
    const profile = resolveFiscalProfile('PE', {
      isFormalTaxpayer: true,
      taxes: [{ name: 'INVENTADO', rate: 0.5, enabled: true }],
    });
    expect(profile.taxes.map((t) => t.name)).toEqual(['IGV']);
  });

  it('countryCode desconocido lanza (sin fallback silencioso)', () => {
    expect(() => resolveFiscalProfile('XX')).toThrow();
  });

  it('fiscalConfig null se trata como ausente (jsonb nullable)', () => {
    const profile = resolveFiscalProfile('VE', null);
    expect(profile.taxes).toContainEqual({ name: 'IVA', rate: 0.16, enabled: false });
    expect(profile.isFormalTaxpayer).toBe(false);
  });

  it('fiscalConfig inválido lanza (tasa > 1, schema estricto)', () => {
    expect(() =>
      resolveFiscalProfile('VE', { taxes: [{ name: 'IVA', rate: 5, enabled: true }] }),
    ).toThrow();
    expect(() => FiscalConfigSchema.parse({ otroCampo: 1 })).toThrow();
  });
});

describe('findFiscalWriteViolation (validación en escritura, D6)', () => {
  it('activar un impuesto sin declararse formal → TAXES_REQUIRE_FORMAL_TAXPAYER', () => {
    expect(
      findFiscalWriteViolation('VE', { taxes: [{ name: 'IVA', rate: 0.16, enabled: true }] }),
    ).toEqual({ code: 'TAXES_REQUIRE_FORMAL_TAXPAYER', taxName: 'IVA' });
  });

  it('activar un condicional sin confirmarlo → TAX_REQUIRES_CONFIRMATION', () => {
    expect(
      findFiscalWriteViolation('VE', {
        isFormalTaxpayer: true,
        taxes: [{ name: 'IGTF', rate: 0.03, enabled: true }],
      }),
    ).toEqual({ code: 'TAX_REQUIRES_CONFIRMATION', taxName: 'IGTF' });
  });

  it('formal + IGTF confirmado → sin violación', () => {
    expect(findFiscalWriteViolation('VE', VE_FORMAL)).toBeNull();
  });

  it('apagar impuestos nunca viola (el override solo reduce)', () => {
    expect(
      findFiscalWriteViolation('VE', { taxes: [{ name: 'IVA', rate: 0.16, enabled: false }] }),
    ).toBeNull();
  });

  it('config ausente o país sin condicionales → sin violación', () => {
    expect(findFiscalWriteViolation('VE', null)).toBeNull();
    expect(findFiscalWriteViolation('US', { isFormalTaxpayer: true })).toBeNull();
  });
});

describe('previewReceiptTaxes (descomposición tax-inclusive)', () => {
  it('VE sin declaración formal: sin desglose (solo el total pagado)', () => {
    const result = previewReceiptTaxes(11600, resolveFiscalProfile('VE'), 'USD');
    expect(result).toEqual({ subtotal: 11600, taxDetails: [], taxTotal: 0 });
  });

  it('VE formal en VES: solo IVA (IGTF condicional fail-closed)', () => {
    const result = previewReceiptTaxes(
      11600,
      resolveFiscalProfile('VE', { isFormalTaxpayer: true }),
      'VES',
    );
    expect(result.taxDetails.map((t) => t.name)).toEqual(['IVA']);
    expect(result.subtotal).toBe(10000);
    expect(result.taxTotal).toBe(1600);
  });

  it('VE formal + IGTF confirmado en USD: IGTF gross_first y cuadre exacto', () => {
    // Cobrado 30,90 con IVA 16 % + IGTF 3 %: IGTF = 0,93 · resto 29,97 →
    // base 25,84 + IVA 4,13 → suma exacta 30,90.
    const result = previewReceiptTaxes(3090, resolveFiscalProfile('VE', VE_FORMAL), 'USD');
    expect(result.taxDetails).toEqual([
      { name: 'IVA', rate: 0.16, amount: 413 },
      { name: 'IGTF', rate: 0.03, amount: 93 },
    ]);
    expect(result.subtotal).toBe(2584);
    expect(result.taxTotal).toBe(506);
    expect(result.subtotal + result.taxTotal).toBe(3090);
  });

  it('PE formal: IGV 18 % descompuesto; US: sin impuestos', () => {
    const pe = previewReceiptTaxes(
      11800,
      resolveFiscalProfile('PE', { isFormalTaxpayer: true }),
      'PEN',
    );
    expect(pe.taxDetails).toEqual([{ name: 'IGV', rate: 0.18, amount: 1800 }]);
    expect(pe.subtotal).toBe(10000);

    const us = previewReceiptTaxes(5000, resolveFiscalProfile('US'), 'USD');
    expect(us).toEqual({ subtotal: 5000, taxDetails: [], taxTotal: 0 });
  });

  it('base 0 → sin desglose', () => {
    expect(previewReceiptTaxes(0, resolveFiscalProfile('VE'), 'USD')).toEqual({
      subtotal: 0,
      taxDetails: [],
      taxTotal: 0,
    });
  });

  it('lanza con total no entero o negativo (sin fallback)', () => {
    expect(() => previewReceiptTaxes(10.5, resolveFiscalProfile('VE'), 'USD')).toThrow();
    expect(() => previewReceiptTaxes(-1, resolveFiscalProfile('VE'), 'USD')).toThrow();
  });
});
