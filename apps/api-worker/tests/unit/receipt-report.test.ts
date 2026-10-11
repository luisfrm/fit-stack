/**
 * Unit tests for lib/receipt-report.ts — parity between the receipt report
 * state classification and the `issued` SQL filter expression.
 *
 * `classifyReceiptState` classifies the receipt report state for both reports
 * (Panel and Console) and must match the row mapping of both services. The
 * `issued` rule is expressed in SQL by both report repositories:
 *
 *   payments.repository.ts → findReceiptReportRows
 *   platform-receipts-report.repository.ts → findReportRows
 *
 *   issued: receipt_number IS NOT NULL AND receipt_voided = false AND receipt_pdf_key IS NOT NULL
 *
 * SQL cannot be imported into a unit test, so the filters are mirrored here as
 * plain predicates: this file is the parity gate that keeps the classification
 * and the SQL expression from drifting apart.
 */
import { describe, expect, it } from 'vitest';
import type { ReceiptReportState } from '@workspace/shared';
import { classifyReceiptState } from '../../src/lib/receipt-report';

/** Classification input: the three persisted flags, already normalized. */
interface ReceiptStateGroup {
  voided: boolean;
  noNumber: boolean;
  noPdf: boolean;
}

/** Persisted columns of one matrix row plus the expected report state. */
interface MatrixRow {
  voided: boolean;
  /** `receipt_number` present in the DB row. */
  number: boolean;
  /** `receipt_pdf_key` present in the DB row. */
  pdf: boolean;
  expected: ReceiptReportState;
}

function toGroup(row: { voided: boolean; number: boolean; pdf: boolean }): ReceiptStateGroup {
  return { voided: row.voided, noNumber: !row.number, noPdf: !row.pdf };
}

/** Mirror of the `issued` SQL filter (see file header). */
function sqlIssuedFilter(group: ReceiptStateGroup): boolean {
  return !group.noNumber && !group.voided && !group.noPdf;
}

/** Mirror of the `pre_system` SQL filter: `receipt_number IS NULL`. */
function sqlPreSystemFilter(group: ReceiptStateGroup): boolean {
  return group.noNumber;
}

/**
 * Full `voided × number × pdf` matrix (8 combinations). `voided` wins by
 * precedence, so every voided row classifies as `voided`.
 */
const MATRIX: MatrixRow[] = [
  // Not voided.
  { voided: false, number: true, pdf: true, expected: 'issued' },
  { voided: false, number: true, pdf: false, expected: 'pending' },
  { voided: false, number: false, pdf: true, expected: 'pre_system' },
  { voided: false, number: false, pdf: false, expected: 'pre_system' },
  // Voided (wins over number/pdf).
  { voided: true, number: true, pdf: true, expected: 'voided' },
  { voided: true, number: true, pdf: false, expected: 'voided' },
  { voided: true, number: false, pdf: true, expected: 'voided' },
  { voided: true, number: false, pdf: false, expected: 'voided' },
];

/** `receipt_voided = true` with `receipt_number IS NULL`: the documented divergence. */
function isVoidedWithoutNumber(row: MatrixRow): boolean {
  return row.voided && !row.number;
}

describe('receipt report state classification', () => {
  it('classifies the full voided × number × pdf matrix (8 combinations)', () => {
    expect(MATRIX).toHaveLength(8);
    for (const row of MATRIX) {
      expect(classifyReceiptState(toGroup(row))).toBe(row.expected);
    }
  });

  it('keeps `issued` parity on every combination except the documented divergence', () => {
    const parityRows = MATRIX.filter((row) => !isVoidedWithoutNumber(row));
    expect(parityRows).toHaveLength(6);

    for (const row of parityRows) {
      const group = toGroup(row);
      expect(sqlIssuedFilter(group)).toBe(classifyReceiptState(group) === 'issued');
    }
  });

  /**
   * Known divergence (documented, out of scope to fix here): a row with
   * `receipt_voided = true` and `receipt_number IS NULL` classifies as `voided`
   * (JS precedence: voided wins over noNumber) while the `pre_system` SQL
   * filter (`receipt_number IS NULL`) would still select it. Parity on `issued`
   * is unaffected: both sides exclude the row.
   *
   * Unreachable in practice: every void path refuses unnumbered payments
   * (`markReceiptVoided` / `markPlatformReceiptVoided` throw
   * `RECEIPT_NOT_ISSUED`), so `receipt_voided = true` implies a number.
   */
  it('documents the voided-without-number divergence as unreachable by construction', () => {
    for (const pdf of [true, false]) {
      const group = toGroup({ voided: true, number: false, pdf });

      // JS classification: `voided` wins over `noNumber`.
      expect(classifyReceiptState(group)).toBe('voided');
      // `issued` parity holds for this row too: both sides exclude it.
      expect(sqlIssuedFilter(group)).toBe(false);
      expect(classifyReceiptState(group) === 'issued').toBe(false);
      // The divergence lives in the `pre_system` filter, which still matches.
      expect(sqlPreSystemFilter(group)).toBe(true);
    }
  });
});
