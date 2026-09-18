/**
 * `computeReceiptGaps`: hueco sospechoso vs anulado explicado, nunca iguales.
 * Dos series: Panel (`{slug}-{año}-{seq}`) y Console (`FS-{seq}`).
 */
import { describe, expect, it } from 'vitest';
import { computeConsoleReceiptGaps, computePanelReceiptGaps } from '../../src/documents/receipt-gaps';

const base = { year: 2026, slug: 'fit-stack', lastNumber: 4 };

describe('computePanelReceiptGaps', () => {
  it('ausente → hueco con número humano; anulado → explicado con auditoría', () => {
    const gaps = computePanelReceiptGaps({
      ...base,
      entries: [
        { seq: 1, voided: false },
        {
          seq: 3,
          voided: true,
          voidedBy: 'user-1',
          voidedAt: '2026-09-01T10:00:00.000Z',
          voidReason: 'Pago anulado',
        },
        { seq: 4, voided: false },
      ],
    });
    // El emitido (seq 1 y 4) no aparece; el ausente (2) es hueco.
    expect(gaps).toEqual([
      { kind: 'hueco', seq: 2, receiptNumber: 'fit-stack-2026-000002' },
      {
        kind: 'anulado',
        seq: 3,
        receiptNumber: 'fit-stack-2026-000003',
        voidedBy: 'user-1',
        voidedAt: '2026-09-01T10:00:00.000Z',
        voidReason: 'Pago anulado',
      },
    ]);
  });

  it('lastNumber=0 → sin gaps', () => {
    expect(computePanelReceiptGaps({ ...base, lastNumber: 0, entries: [] })).toEqual([]);
  });

  it('seq fuera del universo lanza (sin silencio)', () => {
    expect(() =>
      computePanelReceiptGaps({ ...base, entries: [{ seq: 9, voided: false }] }),
    ).toThrow(/fuera del universo/);
  });

  it('seq duplicado lanza', () => {
    expect(() =>
      computePanelReceiptGaps({
        ...base,
        entries: [
          { seq: 1, voided: false },
          { seq: 1, voided: true },
        ],
      }),
    ).toThrow(/duplicado/);
  });

  it('voidedAt inválida lanza', () => {
    expect(() =>
      computePanelReceiptGaps({
        ...base,
        entries: [{ seq: 1, voided: true, voidedAt: 'no-fecha' }],
      }),
    ).toThrow(/voidedAt inválida/);
  });

  it('slug inválido lanza (el número debe ser coherente)', () => {
    expect(() =>
      computePanelReceiptGaps({ ...base, slug: 'Slug Malo!', entries: [] }),
    ).toThrow();
  });

  it('año fuera de rango lanza', () => {
    expect(() =>
      computePanelReceiptGaps({ ...base, year: 1999, entries: [] }),
    ).toThrow();
  });

  it('lastNumber negativo lanza', () => {
    expect(() =>
      computePanelReceiptGaps({ ...base, lastNumber: -1, entries: [] }),
    ).toThrow(/lastNumber inválido/);
  });

  it('slug en mayúsculas numera como el formato (normalizado)', () => {
    const gaps = computePanelReceiptGaps({
      ...base,
      slug: 'Fit-Stack',
      lastNumber: 1,
      entries: [],
    });
    expect(gaps).toEqual([{ kind: 'hueco', seq: 1, receiptNumber: 'fit-stack-2026-000001' }]);
  });
});

describe('computeConsoleReceiptGaps', () => {
  it('numera FS-N (7 dígitos), sin año ni slug', () => {
    const gaps = computeConsoleReceiptGaps({
      lastNumber: 3,
      entries: [{ seq: 1, voided: false }],
    });
    expect(gaps).toEqual([
      { kind: 'hueco', seq: 2, receiptNumber: 'FS-0000002' },
      { kind: 'hueco', seq: 3, receiptNumber: 'FS-0000003' },
    ]);
  });

  it('anulado → explicado con auditoría; emitido → ausente del resultado', () => {
    const gaps = computeConsoleReceiptGaps({
      lastNumber: 2,
      entries: [
        { seq: 1, voided: false },
        {
          seq: 2,
          voided: true,
          voidedBy: 'support-1',
          voidedAt: '2026-09-10T08:30:00.000Z',
          voidReason: 'Pago duplicado',
        },
      ],
    });
    expect(gaps).toEqual([
      {
        kind: 'anulado',
        seq: 2,
        receiptNumber: 'FS-0000002',
        voidedBy: 'support-1',
        voidedAt: '2026-09-10T08:30:00.000Z',
        voidReason: 'Pago duplicado',
      },
    ]);
  });

  it('lastNumber=0 → sin gaps (serie sin emitir)', () => {
    expect(computeConsoleReceiptGaps({ lastNumber: 0, entries: [] })).toEqual([]);
  });

  it('seq 0 o negativo lanza', () => {
    expect(() =>
      computeConsoleReceiptGaps({ lastNumber: 5, entries: [{ seq: 0, voided: false }] }),
    ).toThrow(/fuera del universo/);
  });

  it('seq fuera del universo lanza', () => {
    expect(() =>
      computeConsoleReceiptGaps({ lastNumber: 2, entries: [{ seq: 3, voided: false }] }),
    ).toThrow(/fuera del universo/);
  });

  it('seq duplicado lanza', () => {
    expect(() =>
      computeConsoleReceiptGaps({
        lastNumber: 2,
        entries: [
          { seq: 1, voided: false },
          { seq: 1, voided: false },
        ],
      }),
    ).toThrow(/duplicado/);
  });

  it('lastNumber inválido lanza', () => {
    expect(() => computeConsoleReceiptGaps({ lastNumber: -1, entries: [] })).toThrow(
      /lastNumber inválido/,
    );
  });
});
