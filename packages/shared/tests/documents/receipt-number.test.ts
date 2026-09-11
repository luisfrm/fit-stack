/**
 * Formato/parse de correlativos Panel ({slug}-año-n) y Console (FS-N).
 */
import { describe, expect, it } from 'vitest';
import {
  formatConsoleReceiptNumber,
  formatPanelReceiptNumber,
  isValidConsoleReceiptNumber,
  isValidPanelReceiptNumber,
  parseConsoleReceiptNumber,
  parsePanelReceiptNumber,
} from '../../src/documents/receipt-number';

describe('formatPanelReceiptNumber', () => {
  it('formatea con zero-pad 6', () => {
    expect(formatPanelReceiptNumber('fit-stack', 2026, 45)).toBe('fit-stack-2026-000045');
    expect(formatPanelReceiptNumber('fit-stack', 2026, 1)).toBe('fit-stack-2026-000001');
  });

  it('normaliza el slug a minúsculas sin espacios', () => {
    expect(formatPanelReceiptNumber('  Fit-Stack ', 2026, 7)).toBe('fit-stack-2026-000007');
  });

  it.each([
    ['fit stack', 2026, 1],
    ['', 2026, 1],
    ['fit_stack', 2026, 1],
    ['fit-stack', 99, 1],
    ['fit-stack', 2026, 0],
    ['fit-stack', 2026, -3],
  ])('lanza con input inválido %j', (slug, year, seq) => {
    expect(() => formatPanelReceiptNumber(slug, year, seq)).toThrow();
  });
});

describe('formatConsoleReceiptNumber', () => {
  it('formatea con zero-pad 7 y sin año', () => {
    expect(formatConsoleReceiptNumber(1)).toBe('FS-0000001');
    expect(formatConsoleReceiptNumber(12345)).toBe('FS-0012345');
  });

  it('lanza con seq inválido', () => {
    expect(() => formatConsoleReceiptNumber(0)).toThrow();
  });
});

describe('parse/isValid', () => {
  it('round-trip Panel', () => {
    const formatted = formatPanelReceiptNumber('mi-gym', 2026, 123);
    expect(parsePanelReceiptNumber(formatted)).toEqual({ slug: 'mi-gym', year: 2026, seq: 123 });
    expect(isValidPanelReceiptNumber(formatted)).toBe(true);
  });

  it('round-trip Console', () => {
    const formatted = formatConsoleReceiptNumber(99);
    expect(parseConsoleReceiptNumber(formatted)).toBe(99);
    expect(isValidConsoleReceiptNumber(formatted)).toBe(true);
  });

  it.each(['', 'FS-1', 'FS-ABC', 'fit-stack-2026-45', 'fit-stack-26-000045', 'OTRO-2026-000001x'])(
    'Panel rechaza "%s"',
    (value) => {
      expect(parsePanelReceiptNumber(value)).toBeNull();
      expect(isValidPanelReceiptNumber(value)).toBe(false);
    },
  );

  it.each(['', 'FS-', 'fit-stack-2026-000045', 'fs-0000001'])('Console rechaza "%s"', (value) => {
    expect(parseConsoleReceiptNumber(value)).toBeNull();
    expect(isValidConsoleReceiptNumber(value)).toBe(false);
  });
});
