/**
 * Lock-in del módulo formatting (fuente única de display de valores).
 * Cubre latam/usa, parse round-trip, formatCents y fechas.
 */
import { describe, expect, it } from 'vitest';
import {
  ValueConverter,
  centsToUnits,
  formatCents,
  formatShortDate,
  unitsToCents,
  type CurrencyFormat,
} from '../src/formatting';

describe('ValueConverter.format', () => {
  it('formatea latam por defecto (1.250,50)', () => {
    expect(ValueConverter.format(1250.5, 'USD', 'latam')).toBe('1.250,50 USD');
  });

  it('formatea usa (1,250.50)', () => {
    const format: CurrencyFormat = 'usa';
    expect(ValueConverter.format(1250.5, 'USD', format)).toBe('1,250.50 USD');
  });

  it('sin símbolo no agrega sufijo', () => {
    expect(ValueConverter.format(1250.5, '', 'latam')).toBe('1.250,50');
  });
});

describe('ValueConverter.parse', () => {
  it('round-trip latam', () => {
    expect(ValueConverter.parse('1.250,50', 'latam')).toBe(1250.5);
  });

  it('round-trip usa', () => {
    expect(ValueConverter.parse('1,250.50', 'usa')).toBe(1250.5);
  });

  it('vacío o inválido → 0', () => {
    expect(ValueConverter.parse('', 'latam')).toBe(0);
    expect(ValueConverter.parse('abc', 'latam')).toBe(0);
  });
});

describe('formatCents', () => {
  it('5000 centavos → 50,00 USD (única vía de display de dinero)', () => {
    expect(formatCents(5000, 'USD', 'latam')).toBe('50,00 USD');
    expect(formatCents(5000, 'USD', 'usa')).toBe('50.00 USD');
  });

  it('1 centavo → 0,01', () => {
    expect(formatCents(1, 'USD', 'latam')).toBe('0,01 USD');
  });
});

describe('ValueConverter.formatInteger / formatDate', () => {
  it('miles sin decimales', () => {
    expect(ValueConverter.formatInteger(1234567, 'latam')).toBe('1.234.567');
    expect(ValueConverter.formatInteger(1234567, 'usa')).toBe('1,234,567');
  });

  it('fechas latam DD/MM/YYYY y usa MM/DD/YYYY', () => {
    const date = new Date(2026, 8, 7);
    expect(ValueConverter.formatDate(date, 'latam')).toBe('07/09/2026');
    expect(ValueConverter.formatDate(date, 'usa')).toBe('09/07/2026');
  });
});

describe('formatShortDate', () => {
  it('fecha corta ES', () => {
    expect(formatShortDate(new Date(2026, 9, 7))).toContain('2026');
  });
});

describe('units round-trip', () => {
  it('centsToUnits/unitsToCents re-exportados desde formatting', () => {
    expect(centsToUnits(5000)).toBe(50);
    expect(unitsToCents(50)).toBe(5000);
  });
});
