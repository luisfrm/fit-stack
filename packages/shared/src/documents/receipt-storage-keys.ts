/* ── Documents / receipt-storage-keys — deterministic R2 storage keys ──────
   Immutable PDF key: derived solely from (emitter, year, number). No random
   suffix: retrying step 2 with the same number overwrites the SAME key
   (idempotency). Pure, edge-safe. Does not collide with gym assets
   (`<orgId>/receipts/`, payment slips: different prefix, different purpose:
   see `@workspace/shared/storage`).

   Each receipt has TWO possible artifacts, both deterministic:

     <...>/<number>.pdf           → issued (bytes frozen upon numbering)
     <...>/<number>-anulado.pdf   → voided (VOIDED stamp, written later)

   The `-anulado` suffix cannot collide with an issuance key because the
   number is validated against format (`isValidPanelReceiptNumber`): no
   issuance key ends with that suffix.
   ─────────────────────────────────────────────────────────────────────── */

import {
  MAX_RECEIPT_YEAR,
  MIN_RECEIPT_YEAR,
  isValidPanelReceiptNumber,
} from './receipt-number';

const PANEL_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Suffix for the PDF bearing the VOIDED stamp. */
export const VOIDED_RECEIPT_SUFFIX = '-anulado';

function assertPanelInputs(
  method: string,
  orgSlug: string,
  year: number,
  receiptNumber: string,
): void {
  const slug = orgSlug.trim().toLowerCase();
  if (slug.length === 0 || !PANEL_SLUG_PATTERN.test(slug)) {
    throw new Error(`${method}: invalid slug ("${orgSlug}").`);
  }
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: invalid year (${String(year)}). Range ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (!isValidPanelReceiptNumber(receiptNumber)) {
    throw new Error(`${method}: invalid receiptNumber (${receiptNumber}).`);
  }
}

function assertPlatformInputs(method: string, year: number, receiptNumber: string): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: invalid year (${String(year)}). Range ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (receiptNumber.trim().length === 0) {
    throw new Error(`${method}: receiptNumber is required.`);
  }
}

/** `receipts/<orgSlug>/<year>/<number>.pdf` (Panel, issuer = gym). */
export function panelReceiptKey(
  orgSlug: string,
  year: number,
  receiptNumber: string,
): string {
  assertPanelInputs('panelReceiptKey', orgSlug, year, receiptNumber);
  return `receipts/${orgSlug.trim().toLowerCase()}/${year}/${receiptNumber}.pdf`;
}

/** `receipts/<orgSlug>/<year>/<number>-anulado.pdf` (Panel, VOIDED). */
export function panelVoidedReceiptKey(
  orgSlug: string,
  year: number,
  receiptNumber: string,
): string {
  assertPanelInputs('panelVoidedReceiptKey', orgSlug, year, receiptNumber);
  return `receipts/${orgSlug.trim().toLowerCase()}/${year}/${receiptNumber}${VOIDED_RECEIPT_SUFFIX}.pdf`;
}

/** `platform/receipts/<year>/<number>.pdf` (Console, FitStack issuer). */
export function platformReceiptKey(year: number, receiptNumber: string): string {
  assertPlatformInputs('platformReceiptKey', year, receiptNumber);
  return `platform/receipts/${year}/${receiptNumber}.pdf`;
}

/** `platform/receipts/<year>/<number>-anulado.pdf` (Console, VOIDED). */
export function platformVoidedReceiptKey(year: number, receiptNumber: string): string {
  assertPlatformInputs('platformVoidedReceiptKey', year, receiptNumber);
  return `platform/receipts/${year}/${receiptNumber}${VOIDED_RECEIPT_SUFFIX}.pdf`;
}
