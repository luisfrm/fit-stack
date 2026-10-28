/**
 * Cálculo de impuestos: descomposición tax-inclusive desde el perfil fiscal
 * del país (`COUNTRIES`, SSOT). Sin override manual.
 * Todo en centavos enteros (ver money.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  computeInclusiveTaxes,
  computeTaxes,
  isTaxApplicable,
  roundCents,
} from '../../src/documents/tax-math';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';
import { PAYMENT_CURRENCY_NOT_VES } from '../../src/constants';
import type { taxCondition } from '../../src/constants';

/** Impuestos VE explícitos (el perfil ya los apaga sin declaración formal). */
const VE_TAXES = [
  { name: 'IVA', rate: 0.16, enabled: true },
  { name: 'IGTF', rate: 0.03, enabled: true, condition: "payment_currency !== 'VES'" },
];

describe('roundCents', () => {
  it('redondea al centavo entero y es el único punto de redondeo', () => {
    expect(roundCents(533.28)).toBe(533);
    expect(roundCents(533.5)).toBe(534);
    expect(roundCents(800)).toBe(800);
  });
});

describe('isTaxApplicable', () => {
  it('IGTF uses the shared condition constant: foreign currency applies, VES does not', () => {
    const igft = {
      name: 'IGTF',
      rate: 0.03,
      enabled: true,
      condition: PAYMENT_CURRENCY_NOT_VES,
    };
    expect(isTaxApplicable(igft, 'USD')).toBe(true);
    expect(isTaxApplicable(igft, 'VES')).toBe(false);
    // Sin moneda informada el condicional no aplica (fail-closed).
    expect(isTaxApplicable(igft)).toBe(false);
  });

  it('unconditional taxes always apply while enabled', () => {
    expect(isTaxApplicable({ name: 'IVA', rate: 0.16, enabled: true }, 'VES')).toBe(true);
    expect(isTaxApplicable({ name: 'IVA', rate: 0.16, enabled: false }, 'VES')).toBe(false);
  });

  it('an unknown condition throws instead of silently skipping or applying the tax', () => {
    const unknown = {
      name: 'X',
      rate: 0.1,
      enabled: true,
      condition: 'payment_currency !== "EUR"' as unknown as taxCondition,
    };
    expect(() => isTaxApplicable(unknown, 'USD')).toThrow('Unknown tax condition');
  });

  it('a disabled tax is never applicable, even with an unknown condition', () => {
    const unknown = {
      name: 'X',
      rate: 0.1,
      enabled: false,
      condition: 'payment_currency !== "EUR"' as unknown as taxCondition,
    };
    expect(isTaxApplicable(unknown, 'USD')).toBe(false);
  });
});

describe('computeTaxes', () => {
  it('VE en USD incluye IVA + IGTF; en VES solo IVA', () => {
    const taxes = VE_TAXES;
    const usd = computeTaxes(100, taxes, { currencyPaid: 'USD' });
    expect(usd.taxDetails).toEqual([
      { name: 'IVA', rate: 0.16, amount: 16 },
      { name: 'IGTF', rate: 0.03, amount: 3 },
    ]);
    expect(usd.taxTotal).toBe(19);
    expect(usd.total).toBe(119);

    const ves = computeTaxes(100, taxes, { currencyPaid: 'VES' });
    expect(ves.taxDetails).toEqual([{ name: 'IVA', rate: 0.16, amount: 16 }]);
    expect(ves.total).toBe(116);
  });

  it('el condicional no aplica sin moneda (fail-closed)', () => {
    expect(computeTaxes(100, VE_TAXES).taxDetails.map((t) => t.name)).toEqual(['IVA']);
  });

  it('CO IVA 19%, PE IGV 18%, US sin impuestos (perfiles formales)', () => {
    expect(
      computeTaxes(100, resolveFiscalProfile('CO', { isFormalTaxpayer: true }).taxes).total,
    ).toBe(119);
    const pe = computeTaxes(100, resolveFiscalProfile('PE', { isFormalTaxpayer: true }).taxes);
    expect(pe.taxDetails).toEqual([{ name: 'IGV', rate: 0.18, amount: 18 }]);
    const us = computeTaxes(100, resolveFiscalProfile('US').taxes);
    expect(us).toEqual({ subtotal: 100, taxDetails: [], taxTotal: 0, total: 100 });
  });

  it('respeta impuestos apagados que reciba (enabled false nunca se aplica)', () => {
    const result = computeTaxes(
      100,
      [{ name: 'IVA', rate: 0.16, enabled: false }],
      { currencyPaid: 'VES' },
    );
    expect(result.taxDetails).toEqual([]);
    expect(result.total).toBe(100);
  });

  it('un no-contribuyente no tiene impuestos que calcular (perfil apagado)', () => {
    const { taxes } = resolveFiscalProfile('VE');
    expect(computeTaxes(100, taxes, { currencyPaid: 'USD' }).taxDetails).toEqual([]);
  });

  it('plan free de $0: sin desglose sin sentido', () => {
    const taxes = VE_TAXES;
    expect(computeTaxes(0, taxes, { currencyPaid: 'USD' })).toEqual({
      subtotal: 0,
      taxDetails: [],
      taxTotal: 0,
      total: 0,
    });
  });

  it('redondea por línea al centavo y el total es suma de líneas', () => {
    const result = computeTaxes(3333, [{ name: 'IVA', rate: 0.16, enabled: true }]);
    expect(result.taxDetails).toEqual([{ name: 'IVA', rate: 0.16, amount: 533 }]);
    expect(result.taxTotal).toBe(533);
    expect(result.total).toBe(3866);
  });

  it('base no entera o negativa lanza (centavos enteros ≥ 0)', () => {
    expect(() => computeTaxes(-1, [])).toThrow();
    expect(() => computeTaxes(33.33, [])).toThrow();
    expect(() => computeTaxes(Number.NaN, [])).toThrow();
  });
});

describe('computeInclusiveTaxes', () => {
  it('sin impuestos aplicables: subtotal = total (solo se registra el total pagado)', () => {
    expect(computeInclusiveTaxes(5000, [])).toEqual({
      subtotal: 5000,
      taxDetails: [],
      taxTotal: 0,
      total: 5000,
    });
  });

  it('IGTF (gross_first) se extrae ANTES del desglose de IVA y cuadra exacto', () => {
    const taxes = [
      { name: 'IVA', rate: 0.16, enabled: true },
      { name: 'IGTF', rate: 0.03, enabled: true, basis: 'gross_first' as const },
    ];
    const result = computeInclusiveTaxes(3090, taxes, { currencyPaid: 'USD' });
    expect(result.taxDetails).toEqual([
      { name: 'IVA', rate: 0.16, amount: 413 },
      { name: 'IGTF', rate: 0.03, amount: 93 },
    ]);
    expect(result.subtotal).toBe(2584);
    expect(result.taxTotal).toBe(506);
    expect(result.subtotal + result.taxTotal).toBe(result.total);
  });

  it('gross_first no aplica en VES (condición evaluada por isTaxApplicable)', () => {
    const taxes = [
      { name: 'IVA', rate: 0.16, enabled: true },
      {
        name: 'IGTF',
        rate: 0.03,
        enabled: true,
        basis: 'gross_first' as const,
        condition: "payment_currency !== 'VES'",
      },
    ];
    const result = computeInclusiveTaxes(11600, taxes, { currencyPaid: 'VES' });
    expect(result.taxDetails).toEqual([{ name: 'IVA', rate: 0.16, amount: 1600 }]);
    expect(result.subtotal).toBe(10000);
  });

  it('gross_first inválido (supera el total) lanza en vez de inventar números', () => {
    const taxes = [
      { name: 'A', rate: 1, enabled: true, basis: 'gross_first' as const },
      { name: 'B', rate: 0.5, enabled: true, basis: 'gross_first' as const },
    ];
    expect(() => computeInclusiveTaxes(1000, taxes)).toThrow();
  });

  it('spreads the dust across inclusive lines without leaving negative amounts', () => {
    // total=4: subtotal=round(4/1.51)=3, lines 2 and 0, taxTotal=1.
    // The old "last line absorbs everything" moved the last line to -1.
    const result = computeInclusiveTaxes(4, [
      { name: 'A', rate: 0.5, enabled: true },
      { name: 'B', rate: 0.01, enabled: true },
    ]);

    expect(result.subtotal).toBe(3);
    expect(result.taxTotal).toBe(1);
    expect(result.taxDetails.every((line) => line.amount >= 0)).toBe(true);
    expect(result.taxDetails.reduce((sum, line) => sum + line.amount, 0)).toBe(
      result.taxTotal,
    );
    expect(result.subtotal + result.taxTotal).toBe(result.total);
    // The correction is drained from the previous line when the last is 0.
    expect(result.taxDetails).toEqual([
      { name: 'A', rate: 0.5, amount: 1 },
      { name: 'B', rate: 0.01, amount: 0 },
    ]);
  });
});
