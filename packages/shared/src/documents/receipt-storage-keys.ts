/* ── Documents / receipt-storage-keys — keys R2 deterministas ────────────
   Key del PDF inmutable: derivada solo de (emisor, año, número). Sin sufijo
   aleatorio: reintentar el paso 2 con el mismo número hace overwrite de la
   MISMA key (idempotencia). Puro, edge-safe. No colisiona con los assets del
   gym (`<orgId>/receipts/`, capturas de pago: distinto prefijo, propósito
   distinto: ver `@workspace/shared/storage`).

   Cada comprobante tiene DOS artefactos posibles, ambos deterministas:

     <...>/<numero>.pdf           → emisión (bytes congelados al numerar)
     <...>/<numero>-anulado.pdf   → anulación (sello ANULADO, escrito después)

   El sufijo `-anulado` no puede colisionar con una key de emisión porque el
   número se valida contra el formato (`isValidPanelReceiptNumber`): ninguna
   key de emisión termina con ese sufijo.
   ─────────────────────────────────────────────────────────────────────── */

import {
  MAX_RECEIPT_YEAR,
  MIN_RECEIPT_YEAR,
  isValidPanelReceiptNumber,
} from './receipt-number';

const PANEL_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Sufijo del PDF que lleva el sello ANULADO. */
export const VOIDED_RECEIPT_SUFFIX = '-anulado';

function assertPanelInputs(
  method: string,
  orgSlug: string,
  year: number,
  receiptNumber: string,
): void {
  const slug = orgSlug.trim().toLowerCase();
  if (slug.length === 0 || !PANEL_SLUG_PATTERN.test(slug)) {
    throw new Error(`${method}: slug inválido ("${orgSlug}").`);
  }
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (!isValidPanelReceiptNumber(receiptNumber)) {
    throw new Error(`${method}: receiptNumber inválido (${receiptNumber}).`);
  }
}

function assertPlatformInputs(method: string, year: number, receiptNumber: string): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
  if (receiptNumber.trim().length === 0) {
    throw new Error(`${method}: receiptNumber es obligatorio.`);
  }
}

/** `receipts/<orgSlug>/<year>/<numero>.pdf` (Panel, emisor = gym). */
export function panelReceiptKey(
  orgSlug: string,
  year: number,
  receiptNumber: string,
): string {
  assertPanelInputs('panelReceiptKey', orgSlug, year, receiptNumber);
  return `receipts/${orgSlug.trim().toLowerCase()}/${year}/${receiptNumber}.pdf`;
}

/** `receipts/<orgSlug>/<year>/<numero>-anulado.pdf` (Panel, ANULADO). */
export function panelVoidedReceiptKey(
  orgSlug: string,
  year: number,
  receiptNumber: string,
): string {
  assertPanelInputs('panelVoidedReceiptKey', orgSlug, year, receiptNumber);
  return `receipts/${orgSlug.trim().toLowerCase()}/${year}/${receiptNumber}${VOIDED_RECEIPT_SUFFIX}.pdf`;
}

/** `platform/receipts/<year>/<numero>.pdf` (Console, emisor FitStack). */
export function platformReceiptKey(year: number, receiptNumber: string): string {
  assertPlatformInputs('platformReceiptKey', year, receiptNumber);
  return `platform/receipts/${year}/${receiptNumber}.pdf`;
}

/** `platform/receipts/<year>/<numero>-anulado.pdf` (Console, ANULADO). */
export function platformVoidedReceiptKey(year: number, receiptNumber: string): string {
  assertPlatformInputs('platformVoidedReceiptKey', year, receiptNumber);
  return `platform/receipts/${year}/${receiptNumber}${VOIDED_RECEIPT_SUFFIX}.pdf`;
}
