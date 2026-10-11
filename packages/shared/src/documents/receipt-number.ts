/* ── Documents / receipt-number — correlative number formats ────────────
   Two sequences, two distinct legal issuers:
   - Panel (each gym is its own issuer): `{year}-{seq:06d}` → `2026-000045`.
     The organization slug is NOT part of the number: each organization owns
     its own sequence. The legacy `{slug}-{year}-{seq}` shape is still PARSED,
     because an issued receipt is immutable — its number is never rewritten.
   - Console (FitStack, single issuer): `FS-{seq:07d}` (continuous, no year).
   The year arrives already resolved by the caller (the issuer's local year);
   this module never touches dates.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

export const PANEL_RECEIPT_PAD = 6;
export const CONSOLE_RECEIPT_PAD = 7;
export const MIN_RECEIPT_YEAR = 2000;
export const MAX_RECEIPT_YEAR = 2100;

/** Current shape: `2026-000045`. */
const PANEL_RECEIPT_PATTERN = /^(\d{4})-(\d{6,})$/;
/**
 * Legacy shape, issued before the slug was dropped from the number:
 * `{slug}-2026-000045`. Accepted forever: the number of an issued receipt is
 * never rewritten nor reused.
 */
const PANEL_LEGACY_RECEIPT_PATTERN = /^([a-z0-9-]+)-(\d{4})-(\d{6,})$/;
const CONSOLE_RECEIPT_PATTERN = /^FS-(\d{7,})$/;

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `formatPanelReceiptNumber: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
}

function assertSeq(seq: number): void {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Número correlativo inválido (${String(seq)}). Debe ser entero ≥ 1.`);
  }
}

/** `2026-000045`. The organization slug is not part of the number. */
export function formatPanelReceiptNumber(year: number, seq: number): string {
  assertYear(year);
  assertSeq(seq);
  return `${year}-${String(seq).padStart(PANEL_RECEIPT_PAD, '0')}`;
}

/** `FS-0000001`. Continuous global sequence, no year. */
export function formatConsoleReceiptNumber(seq: number): string {
  assertSeq(seq);
  return `FS-${String(seq).padStart(CONSOLE_RECEIPT_PAD, '0')}`;
}

export interface ParsedPanelReceiptNumber {
  year: number;
  seq: number;
  /** Only present in the legacy shape. */
  slug?: string;
}

/**
 * Strict parse of BOTH shapes (current and legacy); `null` when the value is
 * not a Panel correlative (never throws). The two patterns are unambiguous:
 * the current one requires 2 segments and the legacy one 3.
 */
export function parsePanelReceiptNumber(value: string): ParsedPanelReceiptNumber | null {
  const trimmed = value.trim();

  const current = PANEL_RECEIPT_PATTERN.exec(trimmed);
  if (current) {
    const year = Number(current[1]);
    if (year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) return null;
    return { year, seq: Number(current[2]) };
  }

  const legacy = PANEL_LEGACY_RECEIPT_PATTERN.exec(trimmed);
  if (legacy) {
    const year = Number(legacy[2]);
    if (year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) return null;
    return { slug: legacy[1] as string, year, seq: Number(legacy[3]) };
  }

  return null;
}

/** Strict parse; `null` when the value is not a Console correlative (never throws). */
export function parseConsoleReceiptNumber(value: string): number | null {
  const match = CONSOLE_RECEIPT_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}

/** `true` when `value` is a valid Panel correlative (current or legacy). */
export function isValidPanelReceiptNumber(value: string): boolean {
  return parsePanelReceiptNumber(value) !== null;
}

/** `true` when `value` is a valid Console correlative. */
export function isValidConsoleReceiptNumber(value: string): boolean {
  return parseConsoleReceiptNumber(value) !== null;
}
