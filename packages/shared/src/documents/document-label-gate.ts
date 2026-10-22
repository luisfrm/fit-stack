/* ── Documents / label gate — single source of truth ───────────────────
   Decides visible document label ("Comprobante de pago" vs
   "Factura"). Defensive gate with 3 conditions: if ANY is missing,
   "Comprobante de pago" is enforced even if emitter requested "Factura".
   The gate takes no overrides: homologation comes only from the constant.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

/** Allowed visible labels on a receipt. */
export type DocumentLabel = 'Comprobante de pago' | 'Factura';

/**
 * The ONLY fiscal-homologation switch. No real homologation is connected
 * (no SENIAT, DIAN, SAT…): there is no config, no env var and no endpoint
 * that can turn it on. The day real fiscal homologation exists, flip this
 * constant and the gate applies it everywhere.
 */
export const HAS_FISCAL_HOMOLOGATION = false as const;

export interface DocumentLabelGateInput {
  /** RIF/NIT/RUC/CUIT… of emitter. Empty or whitespace = missing. */
  taxId?: string | null;
  /** Explicit formal taxpayer declaration (with UX friction). */
  isFormalTaxpayer?: boolean;
}

/**
 * Resolves document label. Only returns `'Factura'` when all 3 conditions
 * are true simultaneously; in any other case returns `'Comprobante de pago'`.
 * No "requested label" parameter and no homologation override: the gate
 * decides from `HAS_FISCAL_HOMOLOGATION` alone, callers cannot opt in.
 */
export function resolveDocumentLabel(input: DocumentLabelGateInput): DocumentLabel {
  const identifiable =
    input.isFormalTaxpayer === true && (input.taxId ?? '').trim().length > 0;
  return HAS_FISCAL_HOMOLOGATION && identifiable ? 'Factura' : 'Comprobante de pago';
}
