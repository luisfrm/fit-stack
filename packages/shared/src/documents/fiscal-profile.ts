import { z } from 'zod';
import { COUNTRIES } from '../constants';
import type { IFiscalConfig } from '../types';
import { DOCUMENT_LABELS } from './document-label-gate';

/**
 * Perfil fiscal resuelto de un emisor (gym/org).
 *
 * Regla de oro: el país define el default (`COUNTRIES[countryCode]`), la org lo
 * sobreescribe (`organization.fiscalConfig`). El código nunca decide impuestos
 * ni etiquetas por su cuenta: si el país no existe, es un error visible.
 */

export const TaxConfigSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0),
  enabled: z.boolean(),
});

export const FiscalMechanismSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

export const FiscalConfigSchema = z.object({
  documentLabel: z.string().min(1).optional(),
  isFormalTaxpayer: z.boolean().optional(),
  taxes: z.array(TaxConfigSchema).optional(),
  disclaimerOverride: z.array(z.string()).optional(),
  fiscalMechanism: FiscalMechanismSchema.nullable().optional(),
});

export type FiscalConfig = z.infer<typeof FiscalConfigSchema>;

export interface ResolvedTax {
  name: string;
  /** Tasa decimal (0.16 = 16%). */
  rate: number;
  enabled: boolean;
  /** Condición de aplicación (solo impuestos condicionales del país). */
  condition?: string;
}

export interface ResolvedFiscalProfile {
  taxes: ResolvedTax[];
  disclaimer: string[];
  isFormalTaxpayer: boolean;
  /** Etiqueta del documento de identidad fiscal ("R.I.F.", "NIT"…). */
  taxLabel: string;
  /** Etiqueta del documento de identidad del miembro ("C.I.", "C.C."…). */
  docLabel: string;
  /** Etiqueta pedida por la org (puede ser "Factura"; el gate decide la real). */
  requestedDocumentLabel: string;
}

/**
 * Convierte la tasa del país (string, ej. "16%") a decimal (0.16).
 * Acepta también valores ya decimales ("0.16").
 */
export function parseRate(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('La tasa de impuesto no puede estar vacía.');

  const numeric = Number.parseFloat(trimmed.replace('%', ''));
  if (!Number.isFinite(numeric)) {
    throw new Error(`Tasa de impuesto inválida: ${value}`);
  }
  if (trimmed.includes('%')) return numeric / 100;
  return numeric > 1 ? numeric / 100 : numeric;
}

/**
 * Resuelve el perfil fiscal del emisor: impuestos base + condicionales del país,
 * con override por nombre desde `fiscalConfig`. Los impuestos nacen `enabled: false`
 * (la mayoría de los gyms no son contribuyentes formales); la org los habilita.
 */
export function resolveFiscalProfile(
  countryCode: string,
  fiscalConfig?: IFiscalConfig | null,
): ResolvedFiscalProfile {
  const country = COUNTRIES[countryCode];
  if (!country) {
    throw new Error(`País no soportado para perfil fiscal: ${countryCode}`);
  }

  const overrides = new Map(
    (fiscalConfig?.taxes ?? []).map((tax) => [tax.name.trim().toLowerCase(), tax]),
  );
  const applied = new Set<string>();
  const taxes: ResolvedTax[] = [];

  for (const tax of country.countryTaxes) {
    const key = tax.name.trim().toLowerCase();
    const override = overrides.get(key);
    taxes.push({
      name: tax.name,
      rate: override?.rate ?? parseRate(tax.value),
      enabled: override?.enabled ?? false,
    });
    applied.add(key);
  }

  for (const tax of country.conditionalTaxes ?? []) {
    const key = tax.name.trim().toLowerCase();
    const override = overrides.get(key);
    taxes.push({
      name: tax.name,
      rate: override?.rate ?? parseRate(tax.value),
      enabled: override?.enabled ?? false,
      condition: tax.condition,
    });
    applied.add(key);
  }

  for (const [key, override] of overrides) {
    if (!applied.has(key)) {
      taxes.push({ name: override.name, rate: override.rate, enabled: override.enabled });
    }
  }

  const disclaimerOverridden = fiscalConfig?.disclaimerOverride;
  const disclaimer =
    disclaimerOverridden && disclaimerOverridden.length > 0
      ? [...disclaimerOverridden]
      : [...country.legalDisclaimer];

  const requestedLabel = fiscalConfig?.documentLabel?.trim();

  return {
    taxes,
    disclaimer,
    isFormalTaxpayer: fiscalConfig?.isFormalTaxpayer === true,
    taxLabel: country.taxLabel,
    docLabel: country.docLabel,
    requestedDocumentLabel: requestedLabel || DOCUMENT_LABELS.receipt,
  };
}
