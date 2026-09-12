/* ── Documents / receipt-storage-keys — keys R2 deterministas ────────────
   Key del PDF inmutable: derivada solo de (emisor, año, número). Sin sufijo
   aleatorio: reintentar el paso 2 con el mismo número hace overwrite de la
   MISMA key (idempotencia). Puro, edge-safe. No colisiona con `cms/<org>/
   receipts/` (capturas de pago: distinto prefijo, distinto propósito).
   ─────────────────────────────────────────────────────────────────────── */

import {
  MAX_RECEIPT_YEAR,
  MIN_RECEIPT_YEAR,
  isValidPanelReceiptNumber,
} from './receipt-number';

const PANEL_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** `receipts/<orgSlug>/<year>/<numero>.pdf` (Panel, emisor = gym). */
export function panelReceiptKey(
  orgSlug: string,
  year: number,
  receiptNumber: string,
): string {
  const slug = orgSlug.trim().toLowerCase();
  if (slug.length === 0 || !PANEL_SLUG_PATTERN.test(slug)) {
    throw new Error(`panelReceiptKey: slug inválido ("${orgSlug}").`);
  }
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `panelReceiptKey: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (!isValidPanelReceiptNumber(receiptNumber)) {
    throw new Error(`panelReceiptKey: receiptNumber inválido (${receiptNumber}).`);
  }
  return `receipts/${slug}/${year}/${receiptNumber}.pdf`;
}

/** `platform/receipts/<year>/<numero>.pdf` (Console, reservado C2). */
export function platformReceiptKey(year: number, receiptNumber: string): string {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `platformReceiptKey: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (receiptNumber.trim().length === 0) {
    throw new Error('platformReceiptKey: receiptNumber es obligatorio.');
  }
  return `platform/receipts/${year}/${receiptNumber}.pdf`;
}
