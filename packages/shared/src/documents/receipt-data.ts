/* ── Documents / receipt-data — contrato del comprobante ─────────────────
   `ReceiptData` es TODO lo que el PDF, el email y el reporte necesitan y
   nada más: emisor congelado, receptor, detalle snapshot, periodo, montos
   en centavos enteros, método enmascarado, impuestos y pie legal.
   El UUID técnico (`payment.id`) NUNCA va en campos visibles: solo viaja
   como `internalPaymentId` marcado @internal y `checklistPrePdf` lo
   detecta si se filtra a un campo visible.
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { ITaxDetail } from '../types';
import { TAX_TOTAL_TOLERANCE } from './tax-math';
import {
  isValidConsoleReceiptNumber,
  isValidPanelReceiptNumber,
} from './receipt-number';

/** Tipo de documento emitido. Hoy solo `'receipt'` es efectivo (gate). */
export type ReceiptDocumentType = 'receipt' | 'invoice';

/** Emisor congelado al momento de la emisión (snapshot, no referencia viva). */
export interface ReceiptEmitter {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  taxLabel: string;
  address?: string | null;
  countryCode: string;
  /** Moneda base del emisor (para exigir tasa si el pago difiere). */
  currency: string;
}

export interface ReceiptRecipient {
  name: string;
  documentId?: string | null;
  docLabel?: string | null;
}

export interface ReceiptDocument {
  number: string;
  type: ReceiptDocumentType;
  /** Etiqueta aplicada por el gate (`resolveDocumentLabel`). */
  label: string;
  /** Emisión (≠ fecha del pago). ISO. */
  issuedAt: string;
}

export interface ReceiptSale {
  planName: string;
  periodStart: string;
  periodEnd: string;
  /** Fecha en que se pagó. ISO. */
  paymentDate: string;
}

/** Montos en centavos enteros (ver `money.ts`). */
export interface ReceiptAmounts {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
}

export interface ReceiptMethod {
  name: string;
  /** Detalles YA enmascarados (`maskPaymentDetails`). */
  maskedDetails?: { label: string; value: string }[];
}

export interface ReceiptFooter {
  disclaimer: string[];
  generatedBy: 'Generado con FitStack';
}

export interface ReceiptData {
  emitter: ReceiptEmitter;
  recipient: ReceiptRecipient;
  document: ReceiptDocument;
  sale: ReceiptSale;
  amounts: ReceiptAmounts;
  method: ReceiptMethod;
  footer: ReceiptFooter;
  /**
   * @internal UUID técnico para trazabilidad interna. NUNCA renderizar.
   */
  internalPaymentId?: number | string;
}

export interface ReceiptChecklist {
  ok: boolean;
  errors: string[];
}

/** Detecta UUIDs técnicos filtrados a campos visibles. */
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Valida el checklist pre-PDF: número presente y válido, sin UUID visible,
 * disclaimer del emisor, tasa si la moneda difiere, y cuadre de totales.
 * Acumula errores (no lanza): el caller decide (decisión §5.3).
 */
export function checklistPrePdf(data: ReceiptData): ReceiptChecklist {
  const errors: string[] = [];

  if (
    data.document.number.trim().length === 0 ||
    (!isValidPanelReceiptNumber(data.document.number) &&
      !isValidConsoleReceiptNumber(data.document.number))
  ) {
    errors.push('Comprobante sin número correlativo válido.');
  }

  const visibleStrings: string[] = [
    data.document.number,
    data.document.label,
    data.emitter.name,
    data.emitter.legalName ?? '',
    data.emitter.taxId ?? '',
    data.emitter.address ?? '',
    data.recipient.name,
    data.recipient.documentId ?? '',
    data.sale.planName,
    data.method.name,
    ...(data.method.maskedDetails ?? []).map((d) => `${d.label} ${d.value}`),
  ];
  if (visibleStrings.some((s) => UUID_PATTERN.test(s))) {
    errors.push('UUID técnico visible en campos del comprobante.');
  }

  if (data.footer.disclaimer.length === 0) {
    errors.push('Falta el disclaimer legal del emisor.');
  }

  if (
    data.amounts.currencyPaid !== data.emitter.currency &&
    (data.amounts.exchangeRateApplied ?? '').trim().length === 0
  ) {
    errors.push('Falta la tasa de cambio (moneda del pago ≠ moneda del emisor).');
  }

  if (
    Math.abs(data.amounts.total - (data.amounts.subtotal + data.amounts.taxTotal)) >
    TAX_TOTAL_TOLERANCE
  ) {
    errors.push('El total no cuadra con subtotal + impuestos.');
  }
  const linesSum = data.amounts.taxDetails.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(linesSum - data.amounts.taxTotal) > TAX_TOTAL_TOLERANCE) {
    errors.push('El desglose de impuestos no cuadra con el total de impuestos.');
  }

  return { ok: errors.length === 0, errors };
}
