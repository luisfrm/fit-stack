import { z } from 'zod';
import type { ITaxDetail } from '../types';
import type { ResolvedTax } from './fiscal-profile';

/**
 * Cálculo de impuestos (automático por defecto) + override manual auditado.
 *
 * Modelo: `subtotal` es el precio neto del plan; los impuestos habilitados se
 * calculan SOBRE el subtotal y se suman al total. Con impuestos deshabilitados
 * (el caso de la mayoría de los gyms informales) `subtotal === total`.
 *
 * Redondeo: half-up a 2 decimales, centralizado en `roundCurrency` para que el
 * mismo criterio aplique en todo el proyecto.
 */

export const TaxDetailSchema = z.object({
  name: z.string().min(1),
  rate: z.number(),
  amount: z.number(),
});

export interface TaxContext {
  currencyPaid?: string;
  primaryCurrency?: string;
}

export interface ComputedTaxes {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  total: number;
}

/** Redondeo monetario half-up a 2 decimales. */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Evalúa la condición de un impuesto condicional del país. Hoy solo existe
 * `payment_currency !== 'X'` (IGTF en VE). Una condición desconocida NO aplica
 * el impuesto (default seguro: nunca inventar un impuesto).
 */
export function evaluateTaxCondition(condition: string | undefined, ctx: TaxContext): boolean {
  if (!condition) return true;
  const match = /^payment_currency\s*!==\s*'([^']+)'$/.exec(condition.trim());
  if (match) {
    const excluded = match[1] ?? '';
    return (ctx.currencyPaid ?? '') !== excluded;
  }
  return false;
}

/**
 * Calcula el desglose de impuestos sobre `subtotal`. Sin base positiva no hay
 * desglose (evita líneas de impuesto sin sentido en pagos trial/free de $0).
 */
export function computeTaxes(
  subtotal: number,
  taxes: ResolvedTax[],
  ctx: TaxContext = {},
): ComputedTaxes {
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return { subtotal: 0, taxDetails: [], taxTotal: 0, total: 0 };
  }

  const taxDetails: ITaxDetail[] = [];
  for (const tax of taxes) {
    if (!tax.enabled) continue;
    if (!evaluateTaxCondition(tax.condition, ctx)) continue;

    const amount = roundCurrency(subtotal * tax.rate);
    if (amount <= 0) continue;

    taxDetails.push({ name: tax.name, rate: tax.rate, amount });
  }

  const taxTotal = roundCurrency(taxDetails.reduce((acc, detail) => acc + detail.amount, 0));
  return {
    subtotal,
    taxDetails,
    taxTotal,
    total: roundCurrency(subtotal + taxTotal),
  };
}

export interface TaxOverrideInput {
  taxTotal?: number;
  taxDetails?: ITaxDetail[];
  taxOverrideReason?: string | null;
  actor?: string | null;
}

export interface OverriddenTaxes extends ComputedTaxes {
  taxOverrideReason: string;
  taxOverrideBy: string | null;
}

/**
 * Aplica un override manual de impuestos. Exige motivo no vacío (decisión:
 * híbrido — el cálculo es automático, el override es auditable) y al menos
 * uno de `taxTotal`/`taxDetails`.
 */
export function applyTaxOverride(
  computed: ComputedTaxes,
  override: TaxOverrideInput,
): OverriddenTaxes {
  const reason = override.taxOverrideReason?.trim();
  if (!reason) {
    throw new Error('El override de impuestos requiere un motivo (taxOverrideReason).');
  }
  if (override.taxTotal === undefined && override.taxDetails === undefined) {
    throw new Error('El override de impuestos requiere taxTotal o taxDetails.');
  }

  const taxDetails = (override.taxDetails ?? computed.taxDetails).map((detail) => ({ ...detail }));
  const taxTotal = roundCurrency(
    override.taxTotal ?? taxDetails.reduce((acc, detail) => acc + detail.amount, 0),
  );

  return {
    subtotal: computed.subtotal,
    taxDetails,
    taxTotal,
    total: roundCurrency(computed.subtotal + taxTotal),
    taxOverrideReason: reason,
    taxOverrideBy: override.actor ?? null,
  };
}
