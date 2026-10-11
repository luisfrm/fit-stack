/**
 * Panel (`{year}-{seq}`) and Console (`FS-{seq}`) correlative formats.
 * The legacy `{slug}-{year}-{seq}` shape is still accepted: an issued receipt
 * is immutable and its number is never rewritten.
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
  it('pads the sequence to 6 digits and carries no organization slug', () => {
    expect(formatPanelReceiptNumber(2026, 45)).toBe('2026-000045');
    expect(formatPanelReceiptNumber(2026, 1)).toBe('2026-000001');
  });

  it.each([
    [99, 1],
    [1999, 1],
    [2101, 1],
    [2026, 0],
    [2026, -3],
    [2026, 1.5],
  ])('throws on invalid input (%j, %j)', (year, seq) => {
    expect(() => formatPanelReceiptNumber(year, seq)).toThrow();
  });
});

describe('formatConsoleReceiptNumber', () => {
  it('pads to 7 digits and carries no year', () => {
    expect(formatConsoleReceiptNumber(1)).toBe('FS-0000001');
    expect(formatConsoleReceiptNumber(12345)).toBe('FS-0012345');
  });

  it('throws on an invalid sequence', () => {
    expect(() => formatConsoleReceiptNumber(0)).toThrow();
  });
});

describe('parse/isValid', () => {
  it('round-trips the current Panel shape (no slug)', () => {
    const formatted = formatPanelReceiptNumber(2026, 123);
    expect(formatted).toBe('2026-000123');
    expect(parsePanelReceiptNumber(formatted)).toStrictEqual({ year: 2026, seq: 123 });
    expect(isValidPanelReceiptNumber(formatted)).toBe(true);
  });

  it('still parses the legacy shape with the slug (issued receipts are immutable)', () => {
    expect(parsePanelReceiptNumber('fit-stack-2026-000045')).toStrictEqual({
      slug: 'fit-stack',
      year: 2026,
      seq: 45,
    });
    expect(isValidPanelReceiptNumber('fit-stack-2026-000045')).toBe(true);
  });

  it('round-trips Console', () => {
    const formatted = formatConsoleReceiptNumber(99);
    expect(parseConsoleReceiptNumber(formatted)).toBe(99);
    expect(isValidConsoleReceiptNumber(formatted)).toBe(true);
  });

  it.each([
    '',
    '2026-45', // sequence with fewer than 6 digits
    '2026-00045x',
    '2026-1999-000045', // out-of-range year in the current shape
    'fit-stack-2026-45',
    'fit-stack-26-000045',
    'OTRO-2026-000001x',
  ])('Panel rejects "%s"', (value) => {
    expect(parsePanelReceiptNumber(value)).toBeNull();
    expect(isValidPanelReceiptNumber(value)).toBe(false);
  });

  it.each(['', 'FS-', 'fit-stack-2026-000045', 'fs-0000001'])('Console rejects "%s"', (value) => {
    expect(parseConsoleReceiptNumber(value)).toBeNull();
    expect(isValidConsoleReceiptNumber(value)).toBe(false);
  });
});
