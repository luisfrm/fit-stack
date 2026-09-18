/* ── Documents / fiscal-profile — perfil fiscal del emisor ───────────────
   El país da el default (`COUNTRIES`), la org lo sobreescribe
   (`fiscalConfig`, columna `organization.fiscalConfig`). Cero hardcode
   en consumidores: ningún caller inventa etiquetas ni tasas.
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import { z } from 'zod';
import { COUNTRIES } from '../constants';
import type { ITaxDetail } from '../types';
import { computeInclusiveTaxes } from './tax-math';

/** Override de un impuesto por la org: apagarlo o cambiar su tasa. */
export const FiscalTaxOverrideSchema = z.object({
  name: z.string().min(1),
  /** Tasa como fracción 0–1 (0.16 = 16%). */
  rate: z.number().min(0).max(1),
  enabled: z.boolean(),
});

/**
 * Contrato de `organization.fiscalConfig`. La api-worker lo re-exporta
 * (no lo duplica) para validar el `PATCH /api/organizations/profile`
 * de Fase 4 y el create/update de orgs en console.
 */
export const FiscalConfigSchema = z
  .object({
    /** Etiqueta pedida por el emisor (el gate decide la aplicada). */
    documentLabel: z.string().min(1).optional(),
    /** Declaración explícita de contribuyente formal (Fase 4, con fricción). */
    isFormalTaxpayer: z.boolean().optional(),
    taxes: z.array(FiscalTaxOverrideSchema).optional(),
    /**
     * Nombres de impuestos CONDICIONALES que el emisor confirmó
     * explícitamente (misma fricción que `isFormalTaxpayer`: tasa manual +
     * check de confirmación). Sin esta lista, un condicional (p. ej. IGTF)
     * no se aplica aunque `enabled` sea `true`: el 3 % del país es solo
     * referencia documentada, varía por decreto.
     */
    confirmedTaxes: z.array(z.string().min(1)).optional(),
    /** Si se omite, vale el `legalDisclaimer` del país. */
    disclaimerOverride: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type FiscalConfig = z.infer<typeof FiscalConfigSchema>;

/**
 * Lectura tolerante de `fiscalConfig` ya almacenada (jsonb): parsea con
 * `.strip()` para NO perder los campos conocidos si la fila trae keys de una
 * versión previa/futura. Para escritura se usa siempre `FiscalConfigSchema`
 * (`.strict()`). `null`/inválida → `{}` (base vacía, sin romper el merge).
 */
export const StoredFiscalConfigSchema = FiscalConfigSchema.strip();

/** Impuesto resuelto: default del país + override de la org. */
export interface ResolvedTax {
  name: string;
  /** Fracción 0–1. */
  rate: number;
  enabled: boolean;
  /** Condición sin evaluar (p. ej. `"payment_currency !== 'VES'"`). */
  condition?: string;
  /**
   * `'gross_first'` = se EXTRAE del total cobrado antes de descomponer el
   * resto (`computeInclusiveTaxes`). Aplica a los condicionales (IGTF VE).
   */
  basis?: 'gross_first';
  /** Activación sujeta a fricción explícita (tasa manual + confirmación). */
  requiresConfirmation?: boolean;
}

/** Perfil fiscal efectivo de un emisor para un país dado. */
export interface FiscalProfile {
  taxes: ResolvedTax[];
  disclaimer: string[];
  docLabel: string;
  taxLabel: string;
  isFormalTaxpayer: boolean;
}

/**
 * Parsea una tasa en formato país (`"16%"`, `"16"`, `"0.16"`) a fracción
 * (`0.16`). Valores > 1 se interpretan como porcentaje. Lanza si el valor
 * no es numérico o es negativo — nunca inventa una tasa en silencio.
 */
export function parseRateValue(value: string): number {
  const cleaned = value.trim().replace(/%$/, '').trim().replace(',', '.');
  const parsed = Number(cleaned);
  if (cleaned.length === 0 || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`parseRateValue: tasa inválida ("${value}")`);
  }
  return parsed > 1 ? parsed / 100 : parsed;
}

/**
 * Resuelve el perfil fiscal: defaults de `COUNTRIES[countryCode]` +
 * override de la org (matcheo por `name`; impuestos desconocidos se
 * ignoran). `countryCode` desconocido → error visible, nunca default.
 */
export function resolveFiscalProfile(
  countryCode: string,
  fiscalConfig?: unknown,
): FiscalProfile {
  const country = COUNTRIES[countryCode];
  if (!country) {
    throw new Error(
      `resolveFiscalProfile: countryCode desconocido ("${countryCode}"). Sin fallback silencioso.`,
    );
  }
  // `fiscalConfig` es jsonb nullable: null y undefined significan "sin
  // override" (defaults del país), no un objeto vacío inválido.
  const config: FiscalConfig =
    fiscalConfig == null ? {} : FiscalConfigSchema.parse(fiscalConfig);
  const isFormalTaxpayer = config.isFormalTaxpayer ?? false;
  const confirmed = new Set(config.confirmedTaxes ?? []);

  // D1 (congelada): un emisor que NO declaró ser contribuyente formal no
  // puede cobrar ni declarar impuestos → sus impuestos del país nacen
  // APAGADOS (nunca un desglose que afirme un hecho fiscal falso).
  const taxes: ResolvedTax[] = [
    ...country.countryTaxes.map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled: isFormalTaxpayer,
    })),
    // D2 (congelada): los condicionales nacen SIEMPRE apagados, nunca
    // automáticos (la tasa del país es referencia, no valor efectivo).
    ...(country.conditionalTaxes ?? []).map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled: false,
      condition: t.condition,
      basis: 'gross_first' as const,
      requiresConfirmation: true as const,
    })),
  ];

  for (const override of config.taxes ?? []) {
    const target = taxes.find((t) => t.name === override.name);
    if (!target) continue;
    target.rate = override.rate;
    target.enabled = override.enabled;
  }

  // Normalización defensiva (D6): la configuración ALMACENADA nunca puede
  // activar impuestos que el emisor no declaró — cubre filas escritas antes
  // de esta regla. El error visible se da en la escritura (400
  // `TAXES_REQUIRE_FORMAL_TAXPAYER`); aquí se cierra la lectura.
  for (const tax of taxes) {
    if (!isFormalTaxpayer) {
      tax.enabled = false;
      continue;
    }
    if (tax.requiresConfirmation === true && !confirmed.has(tax.name)) {
      tax.enabled = false;
    }
  }

  return {
    taxes,
    disclaimer: config.disclaimerOverride ?? [...country.legalDisclaimer],
    docLabel: country.docLabel,
    taxLabel: country.taxLabel,
    isFormalTaxpayer,
  };
}

/** Códigos de violación al escribir `fiscalConfig` (los usa la API → 400). */
export type FiscalWriteViolationCode =
  | 'TAXES_REQUIRE_FORMAL_TAXPAYER'
  | 'TAX_REQUIRES_CONFIRMATION';

/**
 * Valida el `fiscalConfig` que se va a PERSISTIR (no el body entrante: un
 * parcial no conoce el `isFormalTaxpayer` almacenado, así que el caller debe
 * pasar el resultado del merge — D6). Devuelve la violación o `null`.
 *
 * Invariante fail-closed: el override solo puede REDUCIR carga fiscal. Un
 * contribuyente formal con actividad exenta desactiva impuestos (permitido);
 * un no-contribuyente nunca puede activarlos.
 */
export function findFiscalWriteViolation(
  countryCode: string,
  config: FiscalConfig | null | undefined,
): { code: FiscalWriteViolationCode; taxName?: string } | null {
  if (config == null) return null;
  const enabled = (config.taxes ?? []).filter((t) => t.enabled);
  if (enabled.length > 0 && config.isFormalTaxpayer !== true) {
    return { code: 'TAXES_REQUIRE_FORMAL_TAXPAYER', taxName: enabled[0]!.name };
  }
  const conditional = new Set(
    (COUNTRIES[countryCode]?.conditionalTaxes ?? []).map((t) => t.name),
  );
  if (conditional.size === 0) return null;
  const confirmed = new Set(config.confirmedTaxes ?? []);
  for (const tax of enabled) {
    if (conditional.has(tax.name) && !confirmed.has(tax.name)) {
      return { code: 'TAX_REQUIRES_CONFIRMATION', taxName: tax.name };
    }
  }
  return null;
}

/** Desglose de impuestos previsualizado (centavos enteros). */
export interface PreviewTaxesResult {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
}

/**
 * Previsualiza los impuestos del modo AUTOMÁTICO para un total cobrado
 * (tax-INCLUSIVE). Delega en `computeInclusiveTaxes` (misma función que usa
 * el paso 1 de emisión en `receipts.service.ts`): preview y comprobante real
 * comparten una única fuente, nunca divergen.
 *
 * `totalCents` es el total cobrado (centavos enteros, ya con impuestos).
 * Base 0 → sin desglose. Condiciones sin evaluar (p. ej. IGTF VE) requieren
 * `currencyPaid`; sin ella NO aplican (fail-closed, igual que el backend).
 */
export function previewReceiptTaxes(
  totalCents: number,
  profile: FiscalProfile,
  currencyPaid?: string,
): PreviewTaxesResult {
  const { subtotal, taxDetails, taxTotal } = computeInclusiveTaxes(
    totalCents,
    profile.taxes,
    { currencyPaid },
  );
  return { subtotal, taxDetails, taxTotal };
}
