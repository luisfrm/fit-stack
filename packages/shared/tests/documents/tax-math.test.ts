/**
 * Cálculo de impuestos: automático por defecto + override auditado.
 * Todo en centavos enteros (ver money.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  applyTaxOverride,
  computeInclusiveTaxes,
  computeTaxes,
  roundCents,
} from '../../src/documents/tax-math';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';

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

  it('respeta impuestos apagados por la org (formal con actividad exenta)', () => {
    const { taxes } = resolveFiscalProfile('VE', {
      isFormalTaxpayer: true,
      taxes: [{ name: 'IVA', rate: 0.16, enabled: false }],
    });
    const result = computeTaxes(100, taxes, { currencyPaid: 'VES' });
    expect(result.taxDetails).toEqual([]);
    expect(result.total).toBe(100);
  });

  it('un no-contribuyente no tiene impuestos que calcular (perfil apagado)', () => {
    const { taxes } = resolveFiscalProfile('VE');
    expect(computeTaxes(100, taxes, { currencyPaid: 'USD' }).taxDetails).toEqual([]);
  });

  it('trial/free de $0: sin desglose sin sentido', () => {
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
});

describe('applyTaxOverride', () => {
  const taxes = [{ name: 'IVA', rate: 0.16, enabled: true }];

  it('sin motivo lanza (híbrido con auditoría)', () => {
    expect(() =>
      applyTaxOverride(100, taxes, {
        taxTotal: 10,
        taxDetails: [{ name: 'IVA', rate: 0.1, amount: 10 }],
        taxOverrideReason: '   ',
      }),
    ).toThrow();
  });

  it('descuadre entre líneas y total lanza (más de 1 centavo)', () => {
    expect(() =>
      applyTaxOverride(100, taxes, {
        taxTotal: 10,
        taxDetails: [{ name: 'IVA', rate: 0.1, amount: 8 }],
        taxOverrideReason: 'Exoneración parcial',
      }),
    ).toThrow();
  });

  it('línea inválida lanza', () => {
    expect(() =>
      applyTaxOverride(100, taxes, {
        taxTotal: 5,
        taxDetails: [{ name: '', rate: 2, amount: -1 }],
        taxOverrideReason: 'motivo',
      }),
    ).toThrow();
  });

  it('override válido retorna el desglose manual', () => {
    const result = applyTaxOverride(
      100,
      taxes,
      {
        taxTotal: 8,
        taxDetails: [{ name: 'IVA reducido', rate: 0.08, amount: 8 }],
        taxOverrideReason: 'Decreto de exoneración 123',
        actor: 'user-1',
      },
    );
    expect(result).toEqual({
      subtotal: 100,
      taxDetails: [{ name: 'IVA reducido', rate: 0.08, amount: 8 }],
      taxTotal: 8,
      total: 108,
    });
  });
});
