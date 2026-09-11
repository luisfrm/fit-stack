/* ── Documents / fiscal-profile — perfil fiscal del emisor ───────────────
   El país da el default (`COUNTRIES`), la org lo sobreescribe
   (`fiscalConfig`, columna `organization.fiscalConfig`). Cero hardcode
   en consumidores: ningún caller inventa etiquetas ni tasas.
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import { z } from 'zod';
import { COUNTRIES } from '../constants';

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
    /** Si se omite, vale el `legalDisclaimer` del país. */
    disclaimerOverride: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type FiscalConfig = z.infer<typeof FiscalConfigSchema>;

/** Impuesto resuelto: default del país + override de la org. */
export interface ResolvedTax {
  name: string;
  /** Fracción 0–1. */
  rate: number;
  enabled: boolean;
  /** Condición sin evaluar (p. ej. `"payment_currency !== 'VES'"`). */
  condition?: string;
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
  const config: FiscalConfig =
    fiscalConfig === undefined ? {} : FiscalConfigSchema.parse(fiscalConfig);

  const taxes: ResolvedTax[] = [
    ...country.countryTaxes.map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled: true as const,
    })),
    ...(country.conditionalTaxes ?? []).map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled: true as const,
      condition: t.condition,
    })),
  ];

  for (const override of config.taxes ?? []) {
    const target = taxes.find((t) => t.name === override.name);
    if (!target) continue;
    target.rate = override.rate;
    target.enabled = override.enabled;
  }

  return {
    taxes,
    disclaimer: config.disclaimerOverride ?? [...country.legalDisclaimer],
    docLabel: country.docLabel,
    taxLabel: country.taxLabel,
    isFormalTaxpayer: config.isFormalTaxpayer ?? false,
  };
}
