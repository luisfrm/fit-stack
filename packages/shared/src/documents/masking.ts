/* ── Documents / masking — masking of sensitive payment references ───────
   Payment references (bank hashes, operation/transaction numbers) are
   sensitive data: partially displayed in UI, printed PDFs, and emails.
   File attachments are NOT altered (they remain as links).
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { IPaymentMethodDetails } from '../types';

const MASK_CHAR = '•';
const MIN_MASKABLE_LENGTH = 7;

/**
 * Masks a reference: preserves the first 4 and last 2
 * visible characters (`123456789012` → `1234••••••12`).
 * Short values (< 7) are completely obscured; empty/null → `""`.
 * Never throws.
 */
export function maskReference(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value.length === 0) return '';
  if (value.length < MIN_MASKABLE_LENGTH) return MASK_CHAR.repeat(value.length);
  const hiddenCount = value.length - 6;
  return `${value.slice(0, 4)}${MASK_CHAR.repeat(hiddenCount)}${value.slice(-2)}`;
}

/**
 * Masks canonical `paymentMethodDetails`: `text`/`number` fields are
 * masked, `file` is kept intact (it is a link, not a secret).
 * Tolerant to legacy object-shaped rows (returns them untouched).
 */
export function maskPaymentDetails(
  details: IPaymentMethodDetails | Record<string, unknown> | null | undefined,
): IPaymentMethodDetails | Record<string, unknown> | null | undefined {
  if (!Array.isArray(details)) return details;
  return details.map((item) => {
    if (item.type === 'file') return item;
    return { ...item, value: maskReference(item.value) };
  });
}
