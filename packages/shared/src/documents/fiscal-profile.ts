/* ── Documents / fiscal-profile — issuer fiscal profile ───────────────────
   `COUNTRIES` is the SINGLE SOURCE OF TRUTH (SSOT) for taxes: rates and
   conditions live only there and no caller (org, panel, console) overrides
   them. The only fiscal switch is `isFormalTaxpayer`, governed exclusively
   from Console: while it is falsy no tax applies at all.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import { z } from 'zod';
import { COUNTRIES } from '../constants';
import type { taxCondition } from '../constants';
import type { ITaxDetail } from '../types';
import { computeInclusiveTaxes } from './tax-math';

/**
 * Contract for `organization.fiscalConfig`. Strict on purpose: any other key
 * (legacy `taxes`/`confirmedTaxes`, `hasFiscalHomologation`, …) fails with
 * 400 — never silently ignored. Taxes are NOT configurable here: they come
 * from `COUNTRIES` (SSOT).
 */
export const FiscalConfigSchema = z
  .object({
    /** Label requested by issuer (the gate determines the one actually applied). */
    documentLabel: z.string().min(1).optional(),
    /**
     * Formal taxpayer declaration. Platform-only: it is written from Console
     * (`PATCH /api/platform/organizations/:id`), never by the tenant.
     */
    isFormalTaxpayer: z.boolean().optional(),
    /** If omitted, falls back to country's `legalDisclaimer`. */
    disclaimerOverride: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type FiscalConfig = z.infer<typeof FiscalConfigSchema>;

/**
 * `fiscalConfig` keys a TENANT can never write: the fiscal regime is a
 * platform decision. They are accepted as input (unknown) by
 * `TenantFiscalConfigSchema` only to be DETECTED and answered with an
 * explicit `403 FISCAL_CONFIG_PLATFORM_ONLY` instead of a silent zod 400.
 */
export const TENANT_FORBIDDEN_FISCAL_KEYS = [
  'isFormalTaxpayer',
  'taxes',
  'confirmedTaxes',
] as const;

/**
 * `fiscalConfig` shape accepted from the tenant (panel). The forbidden keys
 * are typed as `unknown` because they are rejected before parsing them as
 * values — the handler only reads the key names.
 */
export const TenantFiscalConfigSchema = FiscalConfigSchema.extend({
  isFormalTaxpayer: z.unknown().optional(),
  taxes: z.unknown().optional(),
  confirmedTaxes: z.unknown().optional(),
}).strict();

/**
 * Tolerant parsing of already stored `fiscalConfig` (jsonb): parsed with
 * `.strip()` so keys written by a previous/future version (e.g. legacy
 * `taxes`) are dropped instead of breaking the row. For writing,
 * `FiscalConfigSchema` (`.strict()`) is always used.
 * `null`/invalid → `{}` (empty baseline, without breaking merge).
 */
export const StoredFiscalConfigSchema = FiscalConfigSchema.strip();

/**
 * Tolerant parse of `fiscalConfig` ALREADY persisted (jsonb): legacy keys
 * (`taxes`/`confirmedTaxes`) are stripped and an invalid stored value degrades
 * to the empty baseline (no declared regime). Fail-closed and never a 500 in
 * the emission path: a stored row can never assert a fiscal reality this
 * version does not understand. Writing is ALWAYS strict (`FiscalConfigSchema`).
 */
export function parseStoredFiscalConfig(stored: unknown): FiscalConfig {
  const parsed = StoredFiscalConfigSchema.safeParse(stored);
  return parsed.success ? parsed.data : {};
}

/** Resolved tax: straight from the country (no org override exists). */
export interface ResolvedTax {
  name: string;
  /** Fraction 0–1. */
  rate: number;
  enabled: boolean;
  /** Unevaluated condition (e.g. `"payment_currency !== 'VES'"`). */
  condition?: taxCondition;
  /**
   * `'gross_first'` = EXTRACTED from total charged before decomposing the
   * rest (`computeInclusiveTaxes`). Applies to conditional taxes (VE IGTF).
   */
  basis?: 'gross_first';
}

/** Effective fiscal profile of an issuer for a given country. */
export interface FiscalProfile {
  taxes: ResolvedTax[];
  disclaimer: string[];
  docLabel: string;
  taxLabel: string;
  isFormalTaxpayer: boolean;
}

/**
 * Parses a rate in country format (`"16%"`, `"16"`, `"0.16"`) to a fraction
 * (`0.16`). Values > 1 are interpreted as percentage. Throws if value
 * is non-numeric or negative — never invents a rate silently.
 */
export function parseRateValue(value: string): number {
  const cleaned = value.trim().replace(/%$/, '').trim().replace(',', '.');
  const parsed = Number(cleaned);
  if (cleaned.length === 0 || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`parseRateValue: invalid rate ("${value}")`);
  }
  return parsed > 1 ? parsed / 100 : parsed;
}

/**
 * Resolves fiscal profile from `COUNTRIES[countryCode]` (SSOT) and the
 * platform-governed declaration (`fiscalConfig.isFormalTaxpayer`).
 *
 * Frozen rule: while `isFormalTaxpayer` is falsy (absent, `false`, any other
 * falsy value) NO tax applies — there is no intermediate state, and the
 * country taxes are returned disabled. When it is truthy, the country taxes
 * apply as `COUNTRIES` defines them; conditional taxes (VE IGTF) additionally
 * keep their `condition`, evaluated at calculation time.
 *
 * Unknown `countryCode` → visible error, never a silent default.
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
  // `fiscalConfig` is nullable jsonb: null and undefined mean "no override"
  // (country defaults), not an invalid empty object. Stored rows are parsed
  // tolerantly (legacy keys stripped), never with the strict write contract.
  const config: FiscalConfig =
    fiscalConfig == null ? {} : parseStoredFiscalConfig(fiscalConfig);
  const isFormalTaxpayer = config.isFormalTaxpayer === true;
  // Single gate: a non-declared issuer details nothing, so every country tax
  // is born disabled (a false fiscal reality is never stated).
  const enabled = isFormalTaxpayer;

  const taxes: ResolvedTax[] = [
    ...country.countryTaxes.map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled,
    })),
    ...(country.conditionalTaxes ?? []).map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled,
      condition: t.condition,
      basis: 'gross_first' as const,
    })),
  ];

  return {
    taxes,
    disclaimer: config.disclaimerOverride ?? [...country.legalDisclaimer],
    docLabel: country.docLabel,
    taxLabel: country.taxLabel,
    isFormalTaxpayer,
  };
}

/** Previewed tax breakdown (integer cents). */
export interface PreviewTaxesResult {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
}

/**
 * Previews taxes for total charged (tax-INCLUSIVE).
 * Delegates to `computeInclusiveTaxes` (same function used by step 1
 * of issuance in `receipts.service.ts`): preview and real receipt
 * share a single source of truth, never diverging.
 *
 * `totalCents` is total charged (integer cents, already inclusive of tax).
 * Base 0 → no breakdown. Unevaluated conditions (e.g. VE IGTF) require
 * `currencyPaid`; without it they do NOT apply (fail-closed, same as backend).
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
