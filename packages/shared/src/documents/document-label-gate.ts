/* ── Documents / label gate — single source of truth ───────────────────
   Decide la etiqueta visible del documento ("Comprobante de pago" vs
   "Factura"). Gate defensivo de 3 condiciones: si falta CUALQUIERA,
   se fuerza "Comprobante de pago" aunque el emisor pida "Factura".
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

/** Etiquetas visibles permitidas en un comprobante. */
export type DocumentLabel = 'Comprobante de pago' | 'Factura';

/**
 * Hoy NO existe homologación fiscal real conectada (ni SENIAT, DIAN, SAT…).
 * Constante explícita — no silenciosa: el gate devuelve "Comprobante" por
 * construcción hasta que una fase futura la cablee a config real.
 */
export const HAS_FISCAL_HOMOLOGATION = false as const;

export interface DocumentLabelGateInput {
  /** RIF/NIT/RUC/CUIT… del emisor. Vacío o solo espacios = ausente. */
  taxId?: string | null;
  /** Declaración explícita de contribuyente formal (Fase 4, con fricción). */
  isFormalTaxpayer?: boolean;
  /**
   * Homologación fiscal real conectada. Si se omite, vale
   * `HAS_FISCAL_HOMOLOGATION` (hoy `false`).
   */
  hasFiscalHomologation?: boolean;
}

/**
 * Resuelve la etiqueta del documento. Solo devuelve `'Factura'` cuando las
 * 3 condiciones son verdaderas a la vez; en cualquier otro caso devuelve
 * `'Comprobante de pago'`. No hay parámetro de "etiqueta pedida": el gate
 * decide, el caller no elige.
 */
export function resolveDocumentLabel(input: DocumentLabelGateInput): DocumentLabel {
  const normalizedTaxId = (input.taxId ?? '').trim();
  if (input.isFormalTaxpayer !== true) return 'Comprobante de pago';
  if (normalizedTaxId.length === 0) return 'Comprobante de pago';
  const homologated = input.hasFiscalHomologation ?? HAS_FISCAL_HOMOLOGATION;
  if (homologated !== true) return 'Comprobante de pago';
  return 'Factura';
}
