import { describe, expect, it } from 'vitest';
import {
  formatConsoleReceiptNumber,
  formatPanelReceiptNumber,
  isConsoleReceiptNumber,
  isPanelReceiptNumber,
  isReceiptNumber,
  parseConsoleReceiptNumber,
  parsePanelReceiptNumber,
} from '../../src/index';

describe('panel receipt number', () => {
  it('formats {slug}-{year}-{sequence} with a 6-digit sequence', () => {
    expect(formatPanelReceiptNumber('Mi-Gym', 2026, 45)).toBe('mi-gym-2026-000045');
  });

  it('round-trips through parse', () => {
    const value = formatPanelReceiptNumber('fit-stack', 2026, 123456);
    expect(parsePanelReceiptNumber(value)).toEqual({
      slug: 'fit-stack',
      year: 2026,
      sequence: 123456,
    });
  });

  it('accepts multi-hyphen slugs', () => {
    expect(parsePanelReceiptNumber('mi-gym-center-2026-000001')).toEqual({
      slug: 'mi-gym-center',
      year: 2026,
      sequence: 1,
    });
  });

  it('rejects invalid input', () => {
    expect(parsePanelReceiptNumber('123456')).toBeNull();
    expect(parsePanelReceiptNumber('mi-gym-26-1')).toBeNull();
    expect(isPanelReceiptNumber('mi-gym-2026-000001')).toBe(true);
    expect(isPanelReceiptNumber('FS-0000001')).toBe(false);
  });

  it('throws on invalid year or sequence', () => {
    expect(() => formatPanelReceiptNumber('gym', 26, 1)).toThrow();
    expect(() => formatPanelReceiptNumber('gym', 2026, 0)).toThrow();
    expect(() => formatPanelReceiptNumber('', 2026, 1)).toThrow();
  });
});

describe('console receipt number', () => {
  it('formats FS-{sequence} with a 7-digit sequence', () => {
    expect(formatConsoleReceiptNumber(1)).toBe('FS-0000001');
    expect(parseConsoleReceiptNumber('FS-0000001')).toEqual({ sequence: 1 });
    expect(isConsoleReceiptNumber('FS-0000001')).toBe(true);
    expect(isConsoleReceiptNumber('mi-gym-2026-000001')).toBe(false);
  });

  it('throws on invalid sequence', () => {
    expect(() => formatConsoleReceiptNumber(0)).toThrow();
  });
});

describe('isReceiptNumber', () => {
  it('accepts either emitter format and rejects raw ids', () => {
    expect(isReceiptNumber('mi-gym-2026-000045')).toBe(true);
    expect(isReceiptNumber('FS-0000001')).toBe(true);
    expect(isReceiptNumber('42')).toBe(false);
  });
});
