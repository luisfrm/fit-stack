/**
 * Cálculo de impuestos: automático por defecto + override auditado.
 * Todo en unidades mayores con 2 decimales (ver money.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  applyTaxOverride,
  computeTaxes,
  round2,
} from '../../src/documents/tax-math';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';

describe('round2', () => {
  it('es half-up a 2 decimales y único punto de redondeo', () => {
    expect(round2(5.3328)).toBe(5.33);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe('computeTaxes', () => {
  it('VE en USD incluye IVA + IGTF; en VES solo IVA', () => {
    const { taxes } = resolveFiscalProfile('VE');
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
    const { taxes } = resolveFiscalProfile('VE');
    expect(computeTaxes(100, taxes).taxDetails.map((t) => t.name)).toEqual(['IVA']);
  });

  it('CO IVA 19%, PE IGV 18%, US sin impuestos', () => {
    expect(computeTaxes(100, resolveFiscalProfile('CO').taxes).total).toBe(119);
    const pe = computeTaxes(100, resolveFiscalProfile('PE').taxes);
    expect(pe.taxDetails).toEqual([{ name: 'IGV', rate: 0.18, amount: 18 }]);
    const us = computeTaxes(100, resolveFiscalProfile('US').taxes);
    expect(us).toEqual({ subtotal: 100, taxDetails: [], taxTotal: 0, total: 100 });
  });

  it('respeta impuestos apagados por la org', () => {
    const { taxes } = resolveFiscalProfile('VE', {
      taxes: [{ name: 'IVA', rate: 0.16, enabled: false }],
    });
    const result = computeTaxes(100, taxes, { currencyPaid: 'VES' });
    expect(result.taxDetails).toEqual([]);
    expect(result.total).toBe(100);
  });

  it('trial/free de $0: sin desglose sin sentido', () => {
    const { taxes } = resolveFiscalProfile('VE');
    expect(computeTaxes(0, taxes, { currencyPaid: 'USD' })).toEqual({
      subtotal: 0,
      taxDetails: [],
      taxTotal: 0,
      total: 0,
    });
  });

  it('redondea por línea y el total es suma de líneas', () => {
    const result = computeTaxes(33.33, [{ name: 'IVA', rate: 0.16, enabled: true }]);
    expect(result.taxDetails).toEqual([{ name: 'IVA', rate: 0.16, amount: 5.33 }]);
    expect(result.taxTotal).toBe(5.33);
    expect(result.total).toBe(38.66);
  });

  it('base negativa o NaN lanza', () => {
    expect(() => computeTaxes(-1, [])).toThrow();
    expect(() => computeTaxes(Number.NaN, [])).toThrow();
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

  it('descuadre entre líneas y total lanza', () => {
    expect(() =>
      applyTaxOverride(100, taxes, {
        taxTotal: 10,
        taxDetails: [{ name: 'IVA', rate: 0.1, amount: 9 }],
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
