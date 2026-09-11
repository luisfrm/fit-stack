/* ── Documents / tax-math — cálculo de impuestos ─────────────────────────
   Modelo híbrido: automático por defecto (`computeTaxes` desde el perfil
   fiscal), con override manual auditado (`applyTaxOverride` exige motivo).
   UNIDADES: todo opera en unidades mayores con 2 decimales (la unidad de
   `payment.amountPaid` del gym). Callers con centavos convierten en la
   frontera con `centsToUnits`/`unitsToCents` (`money.ts`).
   REDONDEO: half-up a 2 decimales, SOLO aquí (`round2`). El total es la
   suma de líneas ya redondeadas — determinista para PDF y reportes.
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { ITaxDetail } from '../types';

/** Impuesto candidato (tal como sale de `resolveFiscalProfile`). */
export interface TaxInput {
  name: string;
  /** Fracción 0–1. */
  rate: number;
  enabled: boolean;
  /** Condición sin evaluar (p. ej. `"payment_currency !== 'VES'"`). */
  condition?: string;
}

export interface ComputeTaxesOptions {
  /** Moneda del pago. Sin ella, los condicionales NO aplican (fail-closed). */
  currencyPaid?: string;
}

/** Desglose calculado: `total = subtotal + taxTotal` (decisión §5.2). */
export interface ComputedTaxes {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
}

/** Tolerancia de cuadre entre suma de líneas y total declarado. */
export const TAX_TOTAL_TOLERANCE = 0.01;

/** Half-up a 2 decimales. Único lugar del proyecto que redondea impuestos. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertValidBase(base: number): void {
  if (!Number.isFinite(base) || base < 0) {
    throw new Error(`computeTaxes: base inválida (${String(base)}). Debe ser ≥ 0.`);
  }
}

function isTaxApplicable(tax: TaxInput, currencyPaid?: string): boolean {
  if (!tax.enabled) return false;
  if (tax.condition === undefined) return true;
  if (tax.condition === "payment_currency !== 'VES'") {
    return currencyPaid !== undefined && currencyPaid !== 'VES';
  }
  // Condición desconocida: fail-closed, nunca asumir que aplica.
  return false;
}

/**
 * Cálculo automático: aplica cada impuesto habilitado sobre la base
 * (subtotal sin impuestos) en la moneda del pago.
 * Base 0 (trial/free) → sin desglose (`taxDetails: []`, `taxTotal: 0`).
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
    .map((t) => ({ name: t.name, rate: t.rate, amount: round2(base * t.rate) }));
  const taxTotal = round2(taxDetails.reduce((sum, line) => sum + line.amount, 0));
  return { subtotal: base, taxDetails, taxTotal, total: round2(base + taxTotal) };
}

export interface TaxOverrideInput {
  taxTotal: number;
  taxDetails: ITaxDetail[];
  /** Motivo de auditoría. Vacío o solo espacios → lanza. */
  taxOverrideReason: string;
  /** Actor (user.id) que autoriza el override. Informativo. */
  actor?: string;
}

/**
 * Override manual auditado: el caller trae su propio desglose y este lo
 * valida (motivo obligatorio, líneas válidas, suma ≈ total). Lanza si
 * algo no cuadra — nunca persiste un override incoherente en silencio.
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
  if (!Number.isFinite(override.taxTotal) || override.taxTotal < 0) {
    throw new Error(`applyTaxOverride: taxTotal inválido (${String(override.taxTotal)}).`);
  }
  for (const line of override.taxDetails) {
    if (
      line.name.trim().length === 0 ||
      !Number.isFinite(line.rate) ||
      line.rate < 0 ||
      line.rate > 1 ||
      !Number.isFinite(line.amount) ||
      line.amount < 0
    ) {
      throw new Error(
        `applyTaxOverride: línea de impuesto inválida (${JSON.stringify(line)}).`,
      );
    }
  }
  const linesSum = round2(override.taxDetails.reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(linesSum - override.taxTotal) > TAX_TOTAL_TOLERANCE) {
    throw new Error(
      `applyTaxOverride: Σ líneas (${linesSum}) ≠ taxTotal (${override.taxTotal}).`,
    );
  }
  return {
    subtotal: base,
    taxDetails: override.taxDetails,
    taxTotal: override.taxTotal,
    total: round2(base + override.taxTotal),
  };
}
