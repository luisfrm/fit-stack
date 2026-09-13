/**
 * `computeReceiptGaps`: hueco sospechoso vs anulado explicado, nunca iguales.
 */
import { describe, expect, it } from 'vitest';
import { computeReceiptGaps } from '../../src/documents/receipt-gaps';

const base = { year: 2026, slug: 'fit-stack', lastNumber: 4 };

describe('computeReceiptGaps', () => {
  it('ausente → hueco con número humano; anulado → explicado con auditoría', () => {
    const gaps = computeReceiptGaps({
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
    expect(computeReceiptGaps({ ...base, lastNumber: 0, entries: [] })).toEqual([]);
  });

  it('seq fuera del universo lanza (sin silencio)', () => {
    expect(() =>
      computeReceiptGaps({ ...base, entries: [{ seq: 9, voided: false }] }),
    ).toThrow(/fuera del universo/);
  });

  it('seq duplicado lanza', () => {
    expect(() =>
      computeReceiptGaps({
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
      computeReceiptGaps({
        ...base,
        entries: [{ seq: 1, voided: true, voidedAt: 'no-fecha' }],
      }),
    ).toThrow(/voidedAt inválida/);
  });

  it('slug inválido lanza (el número debe ser coherente)', () => {
    expect(() =>
      computeReceiptGaps({ ...base, slug: 'Slug Malo!', entries: [] }),
    ).toThrow();
  });

  it('año fuera de rango lanza', () => {
    expect(() =>
      computeReceiptGaps({ ...base, year: 1999, entries: [] }),
    ).toThrow();
  });

  it('lastNumber negativo lanza', () => {
    expect(() =>
      computeReceiptGaps({ ...base, lastNumber: -1, entries: [] }),
    ).toThrow(/lastNumber inválido/);
  });
});
