import { describe, expect, it } from 'vitest';
import {
  applyTaxOverride,
  computeTaxes,
  evaluateTaxCondition,
  resolveFiscalProfile,
  roundCurrency,
} from '../../src/index';
import type { ResolvedTax } from '../../src/documents/fiscal-profile';

function enabledVeTaxes(): ResolvedTax[] {
  return resolveFiscalProfile('VE', {
    taxes: [
      { name: 'IVA', rate: 0.16, enabled: true },
      { name: 'IGTF', rate: 0.03, enabled: true },
    ],
  }).taxes;
}

describe('computeTaxes', () => {
  it('VE with USD payment includes IVA + IGTF (conditional applies)', () => {
    const result = computeTaxes(100, enabledVeTaxes(), { currencyPaid: 'USD' });

    expect(result.subtotal).toBe(100);
    expect(result.taxDetails.map((detail) => detail.name)).toEqual(['IVA', 'IGTF']);
    expect(result.taxTotal).toBeCloseTo(19);
    expect(result.total).toBeCloseTo(119);
  });

  it('VE with VES payment excludes IGTF (condition fails)', () => {
    const result = computeTaxes(100, enabledVeTaxes(), { currencyPaid: 'VES' });

    expect(result.taxDetails.map((detail) => detail.name)).toEqual(['IVA']);
    expect(result.taxTotal).toBeCloseTo(16);
    expect(result.total).toBeCloseTo(116);
  });

  it('ignores disabled taxes', () => {
    const result = computeTaxes(100, resolveFiscalProfile('VE').taxes, { currencyPaid: 'USD' });
    expect(result.taxDetails).toEqual([]);
    expect(result.total).toBe(100);
  });

  it('a $0 trial/free base produces no tax breakdown (even in a foreign currency)', () => {
    const result = computeTaxes(0, enabledVeTaxes(), { currencyPaid: 'USD' });
    expect(result).toEqual({ subtotal: 0, taxDetails: [], taxTotal: 0, total: 0 });
  });

  it('unknown conditions do not apply (never invent a tax)', () => {
    expect(
      evaluateTaxCondition('some_unknown_expression', { currencyPaid: 'USD' }),
    ).toBe(false);
    const result = computeTaxes(100, [
      { name: 'Raro', rate: 0.5, enabled: true, condition: 'some_unknown_expression' },
    ]);
    expect(result.taxDetails).toEqual([]);
  });
});

describe('applyTaxOverride', () => {
  it('throws without a reason', () => {
    const computed = computeTaxes(100, enabledVeTaxes(), { currencyPaid: 'VES' });
    expect(() => applyTaxOverride(computed, { taxTotal: 20 })).toThrow(/motivo/);
  });

  it('throws if neither taxTotal nor taxDetails is provided', () => {
    const computed = computeTaxes(100, enabledVeTaxes(), { currencyPaid: 'VES' });
    expect(() => applyTaxOverride(computed, { taxOverrideReason: 'ajuste' })).toThrow(
      /taxTotal o taxDetails/,
    );
  });

  it('returns the overridden breakdown with audit info', () => {
    const computed = computeTaxes(100, enabledVeTaxes(), { currencyPaid: 'VES' });
    const result = applyTaxOverride(computed, {
      taxTotal: 5,
      taxOverrideReason: 'Acuerdo comercial con el cliente',
      actor: 'user_123',
    });

    expect(result.taxTotal).toBe(5);
    expect(result.total).toBe(105);
    expect(result.taxOverrideReason).toBe('Acuerdo comercial con el cliente');
    expect(result.taxOverrideBy).toBe('user_123');
  });
});

describe('roundCurrency', () => {
  it('rounds half-up to 2 decimals', () => {
    expect(roundCurrency(10.005)).toBeCloseTo(10.01);
    expect(roundCurrency(10.004)).toBeCloseTo(10);
  });
});
