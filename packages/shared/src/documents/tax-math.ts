/* ── Documents / tax-math — cálculo de impuestos ─────────────────────────
   Modelo híbrido: automático por defecto (`computeTaxes` desde el perfil
   fiscal), con override manual auditado (`applyTaxOverride` exige motivo).
   UNIDADES: todo opera en CENTAVOS ENTEROS (la unidad de `payment` y
   `platform_subscription_payment`: columnas `bigint`). Los callers con
   unidades mayores convierten en la frontera con `unitsToCents` (`money.ts`).
   REDONDEO: al centavo entero más cercano, SOLO aquí (`roundCents`). El
   total es la suma de líneas ya redondeadas — determinista para PDF,
   email y reportes.
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

/** Desglose calculado en centavos enteros: `total = subtotal + taxTotal`. */
export interface ComputedTaxes {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
}

/** Tolerancia de cuadre entre suma de líneas y total declarado (1 centavo). */
export const TAX_TOTAL_TOLERANCE = 1;

/**
 * Redondea al centavo entero más cercano. Único lugar del proyecto que
 * redondea impuestos.
 */
export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON);
}

function assertValidBase(base: number): void {
  if (!Number.isInteger(base) || base < 0) {
    throw new Error(`computeTaxes: base inválida (${String(base)}). Debe ser centavos enteros ≥ 0.`);
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
 * (subtotal en centavos) en la moneda del pago.
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
    .map((t) => ({ name: t.name, rate: t.rate, amount: roundCents(base * t.rate) }));
  const taxTotal = taxDetails.reduce((sum, line) => sum + line.amount, 0);
  return { subtotal: base, taxDetails, taxTotal, total: base + taxTotal };
}

export interface TaxOverrideInput {
  /** Centavos enteros. */
  taxTotal: number;
  /** Centavos enteros por línea. */
  taxDetails: ITaxDetail[];
  /** Motivo de auditoría. Vacío o solo espacios → lanza. */
  taxOverrideReason: string;
  /** Actor (user.id) que autoriza el override. Informativo. */
  actor?: string;
}

/**
 * Override manual auditado: el caller trae su propio desglose (centavos
 * enteros) y este lo valida (motivo obligatorio, líneas válidas, suma ≈
 * total). Lanza si algo no cuadra — nunca persiste un override incoherente
 * en silencio.
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
