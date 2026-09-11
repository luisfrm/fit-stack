/**
 * Conversión centavos ↔ unidades mayores (frontera de unidades).
 */
import { describe, expect, it } from 'vitest';
import { centsToUnits, unitsToCents } from '../../src/documents/money';

describe('centsToUnits', () => {
  it.each([
    [199, 1.99],
    [0, 0],
    [1, 0.01],
    [100000, 1000],
  ])('%i centavos → %s unidades', (cents, expected) => {
    expect(centsToUnits(cents)).toBe(expected);
  });

  it('lanza con NaN/Infinity (sin sanear en silencio)', () => {
    expect(() => centsToUnits(Number.NaN)).toThrow();
    expect(() => centsToUnits(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('unitsToCents', () => {
  it.each([
    [1.99, 199],
    [0, 0],
    [10.5, 1050],
  ])('%s unidades → %i centavos', (units, expected) => {
    expect(unitsToCents(units)).toBe(expected);
  });

  it('round-trip con centavos enteros', () => {
    expect(unitsToCents(centsToUnits(4599))).toBe(4599);
  });

  it('lanza con NaN (sin sanear en silencio)', () => {
    expect(() => unitsToCents(Number.NaN)).toThrow();
  });
});
