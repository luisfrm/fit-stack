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
  /**
   * `'gross_first'` = se EXTRAE del total cobrado y el remanente se
   * descomprime tax-inclusive (IGTF VE). Omitido = tax-inclusive normal.
   */
  basis?: 'gross_first';
  /** Informativo: la activación exigió fricción explícita (no cambia el cálculo). */
  requiresConfirmation?: boolean;
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

export function isTaxApplicable(tax: TaxInput, currencyPaid?: string): boolean {
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

/**
 * Descomposición tax-INCLUSIVE (el total cobrado ya trae los impuestos).
 *
 * Modelo: las líneas `basis: 'gross_first'` (IGTF VE) se EXTRAEN primero del
 * total — la ley las calcula sobre el monto pagado en divisa — y el remanente
 * se descompone tax-inclusive con las demás:
 * `subtotal = round((total − Σgross_first) / (1 + Σtasas))`. Las líneas se
 * calculan sobre esa base y el polvo de redondeo (≤1¢) va a la última para
 * que `subtotal + taxTotal === total` exacto. Base 0 → sin desglose.
 *
 * ⚠️ Activar un impuesto `gross_first` CAMBIA la base del resto (realidad
 * contable del IGTF, deliberado y avisado en el UI).
 *
 * ÚNICA fuente de esta descomposición: la consumen el paso 1 de emisión
 * (`receipts.service.ts`) y el preview del panel (`previewReceiptTaxes`),
 * para que nunca diverjan.
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

  // Orden = el del perfil fiscal (país), no el de las categorías.
  const taxDetails: ITaxDetail[] = applicable.map((t) => ({
    name: t.name,
    rate: t.rate,
    amount: amountByName.get(t.name) ?? 0,
  }));
  const taxTotal = total - subtotal;
  // Polvo de redondeo (≤1¢) a la última línea: la suma cuadra exacto.
  const dust = taxTotal - taxDetails.reduce((sum, l) => sum + l.amount, 0);
  if (taxDetails.length > 0 && dust !== 0) {
    taxDetails[taxDetails.length - 1]!.amount += dust;
  }
  return { subtotal, taxDetails, taxTotal, total };
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
