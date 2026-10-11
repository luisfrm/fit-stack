/* ── Documents / tax-math — tax calculation ─────────────────────────────
   Hybrid model: automatic by default (`computeTaxes` from fiscal profile),
   with audited manual override (`applyTaxOverride` requires a reason).
   UNITS: everything operates in INTEGER CENTS (the unit of `payment` and
   `platform_subscription_payment`: `bigint` columns). Callers with higher-level
   units convert at the boundary using `unitsToCents` (`money.ts`).
   ROUNDING: to the nearest integer cent, ONLY here (`roundCents`).
   Total is the sum of already-rounded line items — deterministic for PDF,
   email, and reporting.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { ITaxDetail } from '../types';

/** Candidate tax (as emitted by `resolveFiscalProfile`). */
export interface TaxInput {
  name: string;
  /** Fraction 0–1. */
  rate: number;
  enabled: boolean;
  /** Unevaluated condition (e.g. `"payment_currency !== 'VES'"`). */
  condition?: string;
  /**
   * `'gross_first'` = EXTRACTED from the total charged and the remainder
   * is decomposed tax-inclusive (IGTF VE). Omitted = standard tax-inclusive.
   */
  basis?: 'gross_first';
  /** Informative: activation required explicit user confirmation (does not affect calculation). */
  requiresConfirmation?: boolean;
}

export interface ComputeTaxesOptions {
  /** Payment currency. Without it, conditional taxes DO NOT apply (fail-closed). */
  currencyPaid?: string;
}

/** Calculated breakdown in integer cents: `total = subtotal + taxTotal`. */
export interface ComputedTaxes {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
}

/** Balance tolerance between line-item sum and declared total (1 cent). */
export const TAX_TOTAL_TOLERANCE = 1;

/**
 * Rounds to the nearest integer cent. Sole place in the project rounding taxes.
 */
export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON);
}

function assertValidBase(base: number): void {
  if (!Number.isInteger(base) || base < 0) {
    throw new Error(`computeTaxes: base inválida (${String(base)}). Debe ser centavos enteros ≥ 0.`);
  }
}

export function isTaxApplicable(tax: TaxInput, currencyPaid?: string): boolean {
  if (!tax.enabled) return false;
  if (tax.condition === undefined) return true;
  if (tax.condition === "payment_currency !== 'VES'") {
    return currencyPaid !== undefined && currencyPaid !== 'VES';
  }
  // Unknown condition: fail-closed, never assume it applies.
  return false;
}

/**
 * Automatic calculation: applies each enabled tax over the base
 * (subtotal in integer cents) in the payment currency.
 * Zero base (trial/free) → no breakdown (`taxDetails: []`, `taxTotal: 0`).
 */
export function computeTaxes(
  base: number,
  taxes: TaxInput[],
  opts?: ComputeTaxesOptions,
): ComputedTaxes {
  assertValidBase(base);
  if (base === 0) {
    return { subtotal: 0, taxDetails: [], taxTotal: 0, total: 0 };
  }
  const taxDetails: ITaxDetail[] = taxes
    .filter((t) => isTaxApplicable(t, opts?.currencyPaid))
    .map((t) => ({ name: t.name, rate: t.rate, amount: roundCents(base * t.rate) }));
  const taxTotal = taxDetails.reduce((sum, line) => sum + line.amount, 0);
  return { subtotal: base, taxDetails, taxTotal, total: base + taxTotal };
}

/**
 * Tax-INCLUSIVE decomposition (total charged already includes taxes).
 *
 * Model: `basis: 'gross_first'` lines (IGTF VE) are EXTRACTED first from
 * the total — statutory rules calculate them on gross paid in foreign currency —
 * and the remainder is decomposed tax-inclusive with the others:
 * `subtotal = round((total − Σgross_first) / (1 + Σrates))`. Lines are
 * computed on that base and rounding dust (≤1¢) goes to the last line so that
 * `subtotal + taxTotal === total` holds exactly. Zero base → no breakdown.
 *
 * ⚠️ Enabling a `gross_first` tax CHANGES the base for the remaining taxes
 * (accounting reality of IGTF, deliberate and indicated in UI).
 *
 * SOLE source of this decomposition: consumed by issuance step 1
 * (`receipts.service.ts`) and panel preview (`previewReceiptTaxes`),
 * preventing divergence.
 */
export function computeInclusiveTaxes(
  total: number,
  taxes: TaxInput[],
  opts?: ComputeTaxesOptions,
): ComputedTaxes {
  assertValidBase(total);
  if (total === 0) {
    return { subtotal: 0, taxDetails: [], taxTotal: 0, total: 0 };
  }
  const applicable = taxes.filter((t) => isTaxApplicable(t, opts?.currencyPaid));
  const grossFirst = applicable.filter((t) => t.basis === 'gross_first');
  const inclusive = applicable.filter((t) => t.basis !== 'gross_first');

  const amountByName = new Map<string, number>();
  let remaining = total;
  for (const tax of grossFirst) {
    const amount = roundCents(total * tax.rate);
    amountByName.set(tax.name, amount);
    remaining -= amount;
  }
  if (remaining < 0) {
    throw new Error(
      'computeInclusiveTaxes: los impuestos gross_first superan el total cobrado.',
    );
  }

  const rateSum = inclusive.reduce((sum, t) => sum + t.rate, 0);
  const subtotal = roundCents(remaining / (1 + rateSum));
  for (const tax of inclusive) {
    amountByName.set(tax.name, roundCents(subtotal * tax.rate));
  }

  // Order = fiscal profile order (country), not category order.
  const taxDetails: ITaxDetail[] = applicable.map((t) => ({
    name: t.name,
    rate: t.rate,
    amount: amountByName.get(t.name) ?? 0,
  }));
  const taxTotal = total - subtotal;
  // Rounding dust (≤1¢) assigned to last line: exact balance.
  const dust = taxTotal - taxDetails.reduce((sum, l) => sum + l.amount, 0);
  if (taxDetails.length > 0 && dust !== 0) {
    taxDetails[taxDetails.length - 1]!.amount += dust;
  }
  return { subtotal, taxDetails, taxTotal, total };
}

export interface TaxOverrideInput {
  /** Integer cents. */
  taxTotal: number;
  /** Integer cents per line. */
  taxDetails: ITaxDetail[];
  /** Audit reason. Empty or whitespace only → throws. */
  taxOverrideReason: string;
  /** Actor (user.id) authorizing the override. Informative. */
  actor?: string;
}

/**
 * Audited manual override: caller provides custom breakdown (integer cents)
 * and this function validates it (mandatory reason, valid lines, sum ≈ total).
 * Throws if inconsistent — never persists an inconsistent override silently.
 */
export function applyTaxOverride(
  base: number,
  _taxes: TaxInput[],
  override: TaxOverrideInput,
): ComputedTaxes {
  assertValidBase(base);
  if (override.taxOverrideReason.trim().length === 0) {
    throw new Error('applyTaxOverride: taxOverrideReason es obligatorio para override manual.');
  }
  if (!Number.isInteger(override.taxTotal) || override.taxTotal < 0) {
    throw new Error(`applyTaxOverride: taxTotal inválido (${String(override.taxTotal)}). Debe ser centavos enteros ≥ 0.`);
  }
  for (const line of override.taxDetails) {
    if (
      line.name.trim().length === 0 ||
      !Number.isFinite(line.rate) ||
      line.rate < 0 ||
      line.rate > 1 ||
      !Number.isInteger(line.amount) ||
      line.amount < 0
    ) {
      throw new Error(
        `applyTaxOverride: línea de impuesto inválida (${JSON.stringify(line)}). El monto debe ser centavos enteros.`,
      );
    }
  }
  const linesSum = override.taxDetails.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(linesSum - override.taxTotal) > TAX_TOTAL_TOLERANCE) {
    throw new Error(
      `applyTaxOverride: Σ líneas (${linesSum}) ≠ taxTotal (${override.taxTotal}).`,
    );
  }
  return {
    subtotal: base,
    taxDetails: override.taxDetails,
    taxTotal: override.taxTotal,
    total: base + override.taxTotal,
  };
}
