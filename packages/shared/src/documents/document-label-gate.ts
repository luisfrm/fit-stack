/* ── Documents / label gate — single source of truth ───────────────────
   Decides visible document label ("Comprobante de pago" vs
   "Factura"). Defensive gate with 3 conditions: if ANY is missing,
   "Comprobante de pago" is enforced even if emitter requested "Factura".
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

/** Allowed visible labels on a receipt. */
export type DocumentLabel = 'Comprobante de pago' | 'Factura';

/**
 * Currently NO real fiscal homologation is connected (no SENIAT, DIAN, SAT…).
 * Explicit constant — not silent: gate returns "Comprobante de pago" by
 * construction until a future phase wires real configuration.
 */
export const HAS_FISCAL_HOMOLOGATION = false as const;

export interface DocumentLabelGateInput {
  /** RIF/NIT/RUC/CUIT… of emitter. Empty or whitespace = missing. */
  taxId?: string | null;
  /** Explicit formal taxpayer declaration (Phase 4, with UX friction). */
  isFormalTaxpayer?: boolean;
  /**
   * Real connected fiscal homologation. If omitted, defaults to
   * `HAS_FISCAL_HOMOLOGATION` (currently `false`).
   */
  hasFiscalHomologation?: boolean;
}

/**
 * Resolves document label. Only returns `'Factura'` when all
 * 3 conditions are true simultaneously; in any other case returns
 * `'Comprobante de pago'`. No "requested label" parameter: gate decides,
 * caller cannot override.
 */
export function resolveDocumentLabel(input: DocumentLabelGateInput): DocumentLabel {
  const normalizedTaxId = (input.taxId ?? '').trim();
  if (input.isFormalTaxpayer !== true) return 'Comprobante de pago';
  if (normalizedTaxId.length === 0) return 'Comprobante de pago';
  const homologated = input.hasFiscalHomologation ?? HAS_FISCAL_HOMOLOGATION;
  if (homologated !== true) return 'Comprobante de pago';
  return 'Factura';
}
