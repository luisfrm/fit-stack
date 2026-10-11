/* ── Receipt report helpers (api-worker) ────────────────────────────────
   Pure mappings shared across BOTH receipt reports (Panel and Console).
   Live here to prevent drift: classification and totals must be
   identical on both sides.
   ─────────────────────────────────────────────────────────────────────── */

import type {
  IReceiptCurrencyTotal,
  IReceiptTaxTotal,
  ITaxDetail,
} from '@workspace/shared';

/** Minimal monetary row exposed by both reports per currency. */
export interface ReceiptMoneyRow {
  subtotal: number | null;
  taxTotal: number | null;
  taxDetails: unknown;
  amountPaid: number;
  currencyPaid: string;
}

/**
 * Guard over persisted data: `tax_details` is jsonb, so rows matching
 * expected format are normalized and the rest discarded (never invented).
 * Integer cents.
 */
export function asTaxDetails(value: unknown): ITaxDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    const l = line as { name?: unknown; rate?: unknown; amount?: unknown };
    if (typeof l.name !== 'string' || typeof l.rate !== 'number' || typeof l.amount !== 'number') {
      return [];
    }
    return [{ name: l.name, rate: l.rate, amount: l.amount }];
  });
}

/** ISO 8601 or `null`. An invalid date string is considered corrupted. */
export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Currency totals for issued-and-not-voided universe. Never mixed sums:
 * one entry per currency, with tax breakdown by name.
 */
export function aggregateCurrencyTotals(rows: ReceiptMoneyRow[]): IReceiptCurrencyTotal[] {
  const byCurrency = new Map<string, IReceiptCurrencyTotal>();
  for (const row of rows) {
    const currency = row.currencyPaid;
    let bucket = byCurrency.get(currency);
    if (!bucket) {
      bucket = { currency, subtotal: 0, taxTotal: 0, amount: 0, byTax: [] };
      byCurrency.set(currency, bucket);
    }
    bucket.subtotal += Number(row.subtotal ?? 0);
    bucket.taxTotal += Number(row.taxTotal ?? 0);
    bucket.amount += Number(row.amountPaid);
    for (const line of asTaxDetails(row.taxDetails)) {
      const existing: IReceiptTaxTotal | undefined = bucket.byTax.find(
        (t) => t.name === line.name,
      );
      if (existing) existing.amount += line.amount;
      else bucket.byTax.push({ name: line.name, amount: line.amount });
    }
  }
  return [...byCurrency.values()];
}

/**
 * Emitter name FROZEN in snapshot (C1) for report row.
 * Intentionally TOLERANT reading: report LISTS (does not recompose document),
 * so unreadable snapshot leaves cell empty rather than failing the whole report.
 * `null` = issuance prior to snapshot introduction.
 */
export function readEmitterName(snapshot: unknown): string | null {
  if (snapshot === null || snapshot === undefined) return null;
  const name = (snapshot as { emitter?: { name?: unknown } }).emitter?.name;
  return typeof name === 'string' && name.trim().length > 0 ? name : null;
}

/**
 * Receipt-state classification used by both reports (Panel and Console).
 * ANTI-DRIFT: must match the row mapping of both services and the `issued`
 * SQL filter of both report repositories — the parity with the SQL expression
 * is pinned by `tests/unit/receipt-report.test.ts`.
 */
export function classifyReceiptState(group: {
  voided: boolean;
  noNumber: boolean;
  noPdf: boolean;
}): 'issued' | 'pending' | 'voided' | 'pre_system' {
  if (group.voided) return 'voided';
  if (group.noNumber) return 'pre_system';
  if (group.noPdf) return 'pending';
  return 'issued';
}
