/* ── Documents / receipt-data — receipt contract ─────────────────────────
   `ReceiptData` is EVERYTHING the PDF, email, and report need and nothing
   more: frozen emitter, recipient, snapshot details, period, integer-cent
   amounts, masked payment method, taxes, and legal footer.
   The technical UUID (`payment.id`) NEVER goes into visible fields: it only
   travels as `@internal` `internalPaymentId`, and `checklistPrePdf` detects
   it if it ever leaks into a visible field.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { ITaxDetail } from '../types';
import { TAX_TOTAL_TOLERANCE } from './tax-math';
import {
  isValidConsoleReceiptNumber,
  isValidPanelReceiptNumber,
} from './receipt-number';

/** Issued document type. Currently only `'receipt'` is active (gate). */
export type ReceiptDocumentType = 'receipt' | 'invoice';

/** Emitter frozen at the moment of issuance (snapshot, not live reference). */
export interface ReceiptEmitter {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  taxLabel: string;
  address?: string | null;
  countryCode: string;
  /** Emitter base currency (to require an exchange rate if payment currency differs). */
  currency: string;
}

export interface ReceiptRecipient {
  name: string;
  documentId?: string | null;
  docLabel?: string | null;
}

/** Tax as applied upon issuance (calculation audit, not country live config). */
export interface ReceiptSnapshotTax {
  name: string;
  /** Fraction 0–1 actually applied. */
  rate: number;
  enabled: boolean;
}

/**
 * Emitter identity FROZEN at the time of issuance (C1). Persisted alongside
 * the number (`emitter_snapshot`) and `GET /:id/receipt` reads it as-is:
 * the JSON and audit trail do not change if the emitter edits their profile
 * later (the PDF in R2 was already immutable). Freezes everything derived live:
 * identity, label applied by the gate, recipient document label, legal footer,
 * emitter timezone used to format dates, and the fiscal profile used for taxes.
 */
export interface ReceiptEmitterSnapshot {
  /** Shape version (allows evolution without breaking older snapshots). */
  version: 1;
  emitter: ReceiptEmitter;
  /** Label applied by `resolveDocumentLabel` upon issuance. */
  documentLabel: string;
  /** Recipient document label (`FiscalProfile.docLabel`). */
  recipientDocLabel: string;
  /** Applied legal disclaimer (emitter country or custom `disclaimerOverride`). */
  disclaimer: string[];
  /** Emitter timezone used to format dates. */
  timezone?: string | null;
  /** Resolved fiscal profile used to calculate taxes. */
  taxes: ReceiptSnapshotTax[];
}

export interface ReceiptDocument {
  number: string;
  type: ReceiptDocumentType;
  /** Label applied by the gate (`resolveDocumentLabel`). */
  label: string;
  /** Issuance date (≠ payment date). ISO. */
  issuedAt: string;
}

export interface ReceiptSale {
  planName: string;
  periodStart: string;
  periodEnd: string;
  /** Payment date. ISO. */
  paymentDate: string;
}

/** Amounts in integer cents (see `money.ts`). */
export interface ReceiptAmounts {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
  currencyPaid: string;
  /**
   * Base commercial currency (plan currency). If different from `currencyPaid`,
   * exchange rate is required. If omitted, checklist uses emitter currency.
   */
  baseCurrency?: string;
  exchangeRateApplied?: string | null;
  /**
   * Total equivalent in `baseCurrency`, frozen from the persisted exchange rate
   * (`exchangeRateApplied`) — never recalculated using a live exchange API.
   * `null` if payment is already in base currency (no conversion to show).
   */
  baseTotal?: number | null;
}

export interface ReceiptMethod {
  name: string;
  /** ALREADY masked details (`maskPaymentDetails`). */
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
  /** Emitter timezone: dates are rendered in local time, not UTC. */
  timezone?: string;
  /** `true` if receipt was voided (number remains preserved). */
  voided?: boolean;
  /**
   * @internal Technical UUID for internal traceability. NEVER render.
   */
  internalPaymentId?: number | string;
}

export interface ReceiptChecklist {
  ok: boolean;
  errors: string[];
}

/** Detects leaked technical UUIDs into visible receipt fields. */
export const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Forbidden placeholder in a visible field: if the data does not exist,
 * the line is OMITTED (FACTURATION.md §3: "omit line if missing, do not invent").
 */
export const MISSING_VALUE_PLACEHOLDER = '---';

/** Optional visible fields: `null` (omit) is valid, the placeholder is not. */
function placeholderViolations(data: ReceiptData): string[] {
  const optionalFields: { label: string; value: string | null | undefined }[] = [
    { label: 'identificación fiscal del emisor', value: data.emitter.taxId },
    { label: 'dirección del emisor', value: data.emitter.address },
    { label: 'documento del receptor', value: data.recipient.documentId },
  ];
  return optionalFields
    .filter((field) => field.value?.trim() === MISSING_VALUE_PLACEHOLDER)
    .map(
      (field) =>
        `Placeholder "${MISSING_VALUE_PLACEHOLDER}" en ${field.label}: la línea debe omitirse, no rellenarse.`,
    );
}

/**
 * Validates pre-PDF checklist: number present and valid, no visible UUID,
 * emitter disclaimer present, exchange rate if currency differs, and total balancing.
 * Accumulates errors (does not throw): caller decides (§5.3).
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

  // Only SYSTEM-GENERATED fields: checklist checks for technical leaks
  // (an internal id printed where document data belongs). Operator-entered
  // details (`method.maskedDetails`) are intentionally EXCLUDED: validation
  // of their format belongs to input validation (`paymentMethodSchema`), not
  // render time — a bank reference formatted like a UUID must not block PDF/email.
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
  ];
  if (visibleStrings.some((s) => UUID_PATTERN.test(s))) {
    errors.push('UUID técnico visible en campos del comprobante.');
  }

  if (data.footer.disclaimer.length === 0) {
    errors.push('Falta el disclaimer legal del emisor.');
  }

  errors.push(...placeholderViolations(data));

  if (
    data.amounts.currencyPaid !== (data.amounts.baseCurrency ?? data.emitter.currency) &&
    (data.amounts.exchangeRateApplied ?? '').trim().length === 0
  ) {
    errors.push('Falta la tasa de cambio (moneda del pago ≠ moneda base del plan).');
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
