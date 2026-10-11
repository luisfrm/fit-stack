/* ── Documents / receipt-gaps — sequence gap auditing ───────────────────
    Frozen business rule (plan.md): a missing number in the sequence is a
    suspicious "gap" (`hueco`); a present number marked with `receipt_voided`
    is an explained "voided" (`anulado`). They are never treated the same,
    and a number is never freed or reused.
    Two sequences, two distinct legal issuers: Panel (`{year}-{seq}`, yearly
    per organization) and Console (`FS-{seq}`, continuous global). The only
    difference is the number format, so it lives in an injected strategy; only
    the algorithm stays here.
    Pure functions, no I/O, edge-safe (Workers).
    ─────────────────────────────────────────────────────────────────────── */

import {
  formatConsoleReceiptNumber,
  formatPanelReceiptNumber,
  parseConsoleReceiptNumber,
  parsePanelReceiptNumber,
} from './receipt-number';

/** Classification of a missing or explained entry in the sequence. */
export type ReceiptGapKind = 'hueco' | 'anulado';

export interface ReceiptGapEntry {
  /** Sequence number within the audited range (1..lastNumber). */
  seq: number;
  /** `true` = number retained but voided (accounted for). */
  voided: boolean;
  voidedBy?: string | null;
  voidedAt?: string | Date | null;
  voidReason?: string | null;
}

export interface ReceiptGapItem {
  kind: ReceiptGapKind;
  seq: number;
  /** Human-readable emitter number. Never the internal payment UUID. */
  receiptNumber: string;
  voidedBy?: string | null;
  /** ISO timestamp. Only present for `anulado`. */
  voidedAt?: string | null;
  voidReason?: string | null;
}

/** Formatting and parsing of ONE series: the human number and its seq. */
export interface ReceiptGapStrategy {
  /** Human representation of `seq` (1-based). Throws if seq is invalid. */
  format(seq: number): string;
  /** `seq` of the number, or `null` if it does not belong to this series. */
  parse(receiptNumber: string): number | null;
}

export interface ComputeReceiptGapsInput {
  /** Last reserved number: audited universe = `1..lastNumber`. */
  lastNumber: number;
  /** Present numbers (issued or voided) in the audited range. */
  entries: ReceiptGapEntry[];
  strategy: ReceiptGapStrategy;
}

/** Panel sequence: yearly per organization (`{year}-{seq}`). */
export interface PanelReceiptGapsInput {
  year: number;
  lastNumber: number;
  entries: ReceiptGapEntry[];
}

/** Console series: continuous global, without year (`FS-{seq}`). */
export interface ConsoleReceiptGapsInput {
  lastNumber: number;
  entries: ReceiptGapEntry[];
}

function toIsoOrNull(value: string | Date | null | undefined, seq: number): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`computeReceiptGaps: voidedAt inválida en seq ${seq}.`);
  }
  return d.toISOString();
}

/**
 * Computes missing entries in the sequence against `1..lastNumber`.
 * Issued receipts do not appear in the result; missing ones are `hueco`
 * and present-but-voided are `anulado`. Throws on inconsistent data (never
 * silently hides a broken sequence).
 */
export function computeReceiptGaps(input: ComputeReceiptGapsInput): ReceiptGapItem[] {
  const { lastNumber, entries, strategy } = input;
  if (!Number.isInteger(lastNumber) || lastNumber < 0) {
    throw new Error(
      `computeReceiptGaps: lastNumber inválido (${String(lastNumber)}). Debe ser entero ≥ 0.`,
    );
  }

  const bySeq = new Map<number, ReceiptGapEntry>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.seq) || entry.seq < 1 || entry.seq > lastNumber) {
      throw new Error(
        `computeReceiptGaps: seq fuera del universo 1..${lastNumber} (${String(entry.seq)}).`,
      );
    }
    if (bySeq.has(entry.seq)) {
      throw new Error(`computeReceiptGaps: seq duplicado (${entry.seq}).`);
    }
    bySeq.set(entry.seq, entry);
  }

  const gaps: ReceiptGapItem[] = [];
  for (let seq = 1; seq <= lastNumber; seq += 1) {
    const receiptNumber = strategy.format(seq);
    // Number↔sequence coherence: formatted number must parse back to the same seq
    // (detects a corrupted series before reporting it as a gap).
    if (strategy.parse(receiptNumber) !== seq) {
      throw new Error(`computeReceiptGaps: número incoherente para seq ${seq}.`);
    }
    const entry = bySeq.get(seq);
    if (!entry) {
      gaps.push({ kind: 'hueco', seq, receiptNumber });
    } else if (entry.voided) {
      gaps.push({
        kind: 'anulado',
        seq,
        receiptNumber,
        voidedBy: entry.voidedBy ?? null,
        voidedAt: toIsoOrNull(entry.voidedAt, seq),
        voidReason: entry.voidReason ?? null,
      });
    }
  }
  return gaps;
}

/**
 * Gaps for the Panel series (yearly, per organization).
 */
export function computePanelReceiptGaps(input: PanelReceiptGapsInput): ReceiptGapItem[] {
  return computeReceiptGaps({
    lastNumber: input.lastNumber,
    entries: input.entries,
    strategy: {
      // The number no longer carries the slug. Legacy receipts still belong to
      // the same universe (they share the per organization/year counter): the
      // `seq` is the identity and the format is only the rendering.
      format: (seq) => formatPanelReceiptNumber(input.year, seq),
      parse: (receiptNumber) => {
        const parsed = parsePanelReceiptNumber(receiptNumber);
        if (!parsed || parsed.year !== input.year) return null;
        return parsed.seq;
      },
    },
  });
}

/** Gaps for the Console series (global continuous, single issuer: FitStack). */
export function computeConsoleReceiptGaps(input: ConsoleReceiptGapsInput): ReceiptGapItem[] {
  return computeReceiptGaps({
    lastNumber: input.lastNumber,
    entries: input.entries,
    strategy: {
      format: (seq) => formatConsoleReceiptNumber(seq),
      parse: (receiptNumber) => parseConsoleReceiptNumber(receiptNumber),
    },
  });
}
