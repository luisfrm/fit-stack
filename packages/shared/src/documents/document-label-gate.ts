/**
 * Gate defensivo "Comprobante de pago" → "Factura".
 *
 * El emisor de la factura fiscal SIEMPRE es el gym (Panel) o FitStack (Console).
 * FitStack NUNCA emite la factura de la venta al miembro: solo provee el software.
 * Para que un documento pueda rotularse "Factura" deben cumplirse las 3
 * condiciones fiscales reales; si falta cualquiera, el gate fuerza
 * "Comprobante de pago" aunque la org haya escrito "Factura" en su config.
 *
 * `FISCAL_HOMOLOGATION_AVAILABLE` es una constante explícita (no silenciosa):
 * hoy no existe proveedor homologado conectado, así que ninguna emisión puede
 * salir como factura por construcción.
 */

export const RECEIPT_DOCUMENT_TYPE = 'receipt' as const;
export const INVOICE_DOCUMENT_TYPE = 'invoice' as const;

export type ReceiptDocumentType =
  | typeof RECEIPT_DOCUMENT_TYPE
  | typeof INVOICE_DOCUMENT_TYPE;

export const DOCUMENT_LABELS: Record<ReceiptDocumentType, string> = {
  receipt: 'Comprobante de pago',
  invoice: 'Factura',
};

/** ¿Hay un mecanismo de homologación fiscal conectado (PAC/DIAN/SENIAT…)? Hoy no. */
export const FISCAL_HOMOLOGATION_AVAILABLE = false;

export interface DocumentGateInput {
  taxId?: string | null;
  isFormalTaxpayer?: boolean | null;
  hasFiscalHomologation?: boolean | null;
}

export interface DocumentKindResult {
  documentType: ReceiptDocumentType;
  label: string;
  missingRequirements: string[];
}

/**
 * Resuelve el tipo de documento permitido a partir de las 3 condiciones.
 * Devuelve `invoice` solo si las tres se cumplen; en cualquier otro caso
 * `receipt`, junto con el detalle de requisitos faltantes.
 */
export function resolveDocumentKind(input: DocumentGateInput): DocumentKindResult {
  const missingRequirements: string[] = [];

  if (!input.taxId || !input.taxId.trim()) {
    missingRequirements.push('taxId');
  }
  if (input.isFormalTaxpayer !== true) {
    missingRequirements.push('isFormalTaxpayer');
  }
  if (input.hasFiscalHomologation !== true) {
    missingRequirements.push('fiscalMechanism');
  }

  const documentType: ReceiptDocumentType =
    missingRequirements.length === 0 ? INVOICE_DOCUMENT_TYPE : RECEIPT_DOCUMENT_TYPE;

  return {
    documentType,
    label: DOCUMENT_LABELS[documentType],
    missingRequirements,
  };
}

/** Etiqueta permitida del documento ('Comprobante de pago' | 'Factura'). */
export function resolveDocumentLabel(input: DocumentGateInput): string {
  return resolveDocumentKind(input).label;
}

/**
 * ¿La org tiene un mecanismo de homologación fiscal utilizable HOY?
 * Requiere que exista un proveedor disponible global y que la config declare
 * el mecanismo con valor. Al ser `FISCAL_HOMOLOGATION_AVAILABLE = false`,
 * hoy siempre devuelve `false`.
 */
export function hasFiscalHomologation(
  fiscalConfig?: { fiscalMechanism?: { type?: string; value?: string } | null } | null,
): boolean {
  if (!FISCAL_HOMOLOGATION_AVAILABLE) return false;
  const value = fiscalConfig?.fiscalMechanism?.value;
  return Boolean(value && value.trim());
}
