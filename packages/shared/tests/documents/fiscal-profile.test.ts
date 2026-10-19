/**
 * Fiscal profile: `COUNTRIES` is the SINGLE SOURCE OF TRUTH for taxes and the
 * only switch is `isFormalTaxpayer` (Console-governed). While it is falsy
 * (absent, `false`) NO tax applies: there is no intermediate state.
 */
import { describe, expect, it } from 'vitest';
import {
  FiscalConfigSchema,
  TENANT_FORBIDDEN_FISCAL_KEYS,
  TenantFiscalConfigSchema,
  parseRateValue,
  parseStoredFiscalConfig,
  previewReceiptTaxes,
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

describe('FiscalConfigSchema (contrato estricto de escritura)', () => {
  it('acepta solo documentLabel, isFormalTaxpayer y disclaimerOverride', () => {
    expect(
      FiscalConfigSchema.parse({
        documentLabel: 'Comprobante de pago',
        isFormalTaxpayer: true,
        disclaimerOverride: ['Aviso'],
      }),
    ).toEqual({
      documentLabel: 'Comprobante de pago',
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso'],
    });
  });

  it.each([
    ['taxes', { taxes: [{ name: 'IVA', rate: 0.16, enabled: true }] }],
    ['confirmedTaxes', { confirmedTaxes: ['IGTF'] }],
    ['hasFiscalHomologation', { hasFiscalHomologation: true }],
    ['otro campo', { otroCampo: 1 }],
  ])('rechaza el campo inexistente "%s" (nunca se ignora en silencio)', (_label, config) => {
    expect(() => FiscalConfigSchema.parse(config)).toThrow();
  });

  it('el tenant no puede enviar las claves de plataforma (detección explícita)', () => {
    // `TenantFiscalConfigSchema` accepts them as `unknown` on purpose: the
    // handler answers 403 FISCAL_CONFIG_PLATFORM_ONLY, never a silent 400.
    for (const key of TENANT_FORBIDDEN_FISCAL_KEYS) {
      expect(TenantFiscalConfigSchema.safeParse({ [key]: true }).success).toBe(true);
    }
    expect(TenantFiscalConfigSchema.safeParse({ hasFiscalHomologation: true }).success).toBe(
      false,
    );
  });
});

describe('resolveFiscalProfile', () => {
  it('VE sin declaración: TODOS los impuestos apagados (nunca afirmar IVA ajeno)', () => {
    const profile = resolveFiscalProfile('VE');
    expect(profile.isFormalTaxpayer).toBe(false);
    expect(profile.taxes).toEqual([
      { name: 'IVA', rate: 0.16, enabled: false },
      {
        name: 'IGTF',
        rate: 0.03,
        enabled: false,
        condition: "payment_currency !== 'VES'",
        basis: 'gross_first',
      },
    ]);
    expect(profile.taxLabel).toBe('R.I.F.');
    expect(profile.docLabel).toBe('C.I.');
    expect(profile.disclaimer.length).toBeGreaterThan(0);
  });

  it.each([
    ['ausente', undefined],
    ['false', { isFormalTaxpayer: false }],
    ['null', null],
    ['config vacía', {}],
    ['sin la clave', { disclaimerOverride: ['Aviso'] }],
  ])('isFormalTaxpayer %s: ningún impuesto se aplica (sin estado intermedio)', (_label, config) => {
    const profile = resolveFiscalProfile('VE', config);
    expect(profile.isFormalTaxpayer).toBe(false);
    expect(profile.taxes.every((t) => !t.enabled)).toBe(true);
  });

  it('VE formal: IVA e IGTF salen directamente de COUNTRIES (sin confirmación manual)', () => {
    const profile = resolveFiscalProfile('VE', { isFormalTaxpayer: true });
    expect(profile.isFormalTaxpayer).toBe(true);
    expect(profile.taxes.find((t) => t.name === 'IVA')).toMatchObject({
      enabled: true,
      rate: 0.16,
    });
    expect(profile.taxes.find((t) => t.name === 'IGTF')).toMatchObject({
      enabled: true,
      rate: 0.03,
      condition: "payment_currency !== 'VES'",
      basis: 'gross_first',
    });
  });

  it('US no trae impuestos', () => {
    expect(resolveFiscalProfile('US').taxes).toEqual([]);
    expect(resolveFiscalProfile('US', { isFormalTaxpayer: true }).taxes).toEqual([]);
  });

  it('la org puede fijar disclaimer custom e isFormalTaxpayer (CO: IVA 19%)', () => {
    const profile = resolveFiscalProfile('CO', {
      disclaimerOverride: ['Aviso custom'],
      isFormalTaxpayer: true,
    });
    expect(profile.disclaimer).toEqual(['Aviso custom']);
    expect(profile.isFormalTaxpayer).toBe(true);
    expect(profile.taxes.find((t) => t.name === 'IVA')).toMatchObject({
      enabled: true,
      rate: 0.19,
    });
  });

  it('una config almacenada con claves legacy se ignora de forma tolerante (sin 500)', () => {
    // Rows written by the previous contract must never break emission nor
    // assert a fiscal reality: the regime comes from `isFormalTaxpayer`.
    const profile = resolveFiscalProfile('VE', {
      isFormalTaxpayer: true,
      taxes: [{ name: 'IVA', rate: 0.1, enabled: true }],
      confirmedTaxes: ['IGTF'],
    });
    expect(profile.taxes.find((t) => t.name === 'IVA')?.rate).toBe(0.16);
    expect(parseStoredFiscalConfig({ taxes: 'basura' })).toEqual({});
    expect(parseStoredFiscalConfig({ isFormalTaxpayer: true, taxes: [] })).toEqual({
      isFormalTaxpayer: true,
    });
  });

  it('countryCode desconocido lanza (sin fallback silencioso)', () => {
    expect(() => resolveFiscalProfile('XX')).toThrow();
  });

  it('fiscalConfig null se trata como ausente (jsonb nullable)', () => {
    const profile = resolveFiscalProfile('VE', null);
    expect(profile.taxes).toEqual([
      { name: 'IVA', rate: 0.16, enabled: false },
      {
        name: 'IGTF',
        rate: 0.03,
        enabled: false,
        condition: "payment_currency !== 'VES'",
        basis: 'gross_first',
      },
    ]);
    expect(profile.isFormalTaxpayer).toBe(false);
  });
});

describe('previewReceiptTaxes (descomposición tax-inclusive)', () => {
  it('VE sin declaración formal: sin desglose (solo el total pagado)', () => {
    const result = previewReceiptTaxes(11600, resolveFiscalProfile('VE'), 'USD');
    expect(result).toEqual({ subtotal: 11600, taxDetails: [], taxTotal: 0 });
  });

  it('VE formal en VES: solo IVA (IGTF condicional no aplica sin moneda extranjera)', () => {
    const result = previewReceiptTaxes(
      11600,
      resolveFiscalProfile('VE', { isFormalTaxpayer: true }),
      'VES',
    );
    expect(result.taxDetails).toEqual([{ name: 'IVA', rate: 0.16, amount: 1600 }]);
    expect(result.subtotal).toBe(10000);
    expect(result.taxTotal).toBe(1600);
  });

  it('VE formal en USD: IVA 16 % + IGTF 3 % gross_first con cuadre exacto', () => {
    // Cobrado 30,90 con IVA 16 % + IGTF 3 %: IGTF = 0,93 · resto 29,97 →
    // base 25,84 + IVA 4,13 → suma exacta 30,90.
    const result = previewReceiptTaxes(
      3090,
      resolveFiscalProfile('VE', { isFormalTaxpayer: true }),
      'USD',
    );
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
