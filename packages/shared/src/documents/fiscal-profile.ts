/* ── Documents / fiscal-profile — issuer fiscal profile ───────────────────
   The country provides the default (`COUNTRIES`), the org overrides it
   (`fiscalConfig`, column `organization.fiscalConfig`). Zero hardcoding
   in consumers: no caller invents labels or tax rates.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import { z } from 'zod';
import { COUNTRIES } from '../constants';
import type { ITaxDetail } from '../types';
import { computeInclusiveTaxes } from './tax-math';

/** Tax override by the org: disable it or change its rate. */
export const FiscalTaxOverrideSchema = z.object({
  name: z.string().min(1),
  /** Rate as fraction 0–1 (0.16 = 16%). */
  rate: z.number().min(0).max(1),
  enabled: z.boolean(),
});

/**
 * Contract for `organization.fiscalConfig`. api-worker re-exports it
 * (without duplicating) to validate `PATCH /api/organizations/profile`
 * in Phase 4 and org create/update in console.
 */
export const FiscalConfigSchema = z
  .object({
    /** Label requested by issuer (gate determines the one actually applied). */
    documentLabel: z.string().min(1).optional(),
    /** Explicit formal taxpayer declaration (Phase 4, with UX friction). */
    isFormalTaxpayer: z.boolean().optional(),
    taxes: z.array(FiscalTaxOverrideSchema).optional(),
    /**
     * Names of CONDITIONAL taxes that the issuer explicitly confirmed
     * (same UX friction as `isFormalTaxpayer`: manual rate + confirmation check).
     * Without this list, a conditional tax (e.g. IGTF) is not applied even if
     * `enabled` is `true`: country's 3% is documented reference, varies by decree.
     */
    confirmedTaxes: z.array(z.string().min(1)).optional(),
    /** If omitted, falls back to country's `legalDisclaimer`. */
    disclaimerOverride: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type FiscalConfig = z.infer<typeof FiscalConfigSchema>;

/**
 * Tolerant parsing of already stored `fiscalConfig` (jsonb): parsed with
 * `.strip()` so known fields are NOT lost if row contains keys from a
 * previous/future version. For writing, `FiscalConfigSchema` (`.strict()`) is always used.
 * `null`/invalid → `{}` (empty baseline, without breaking merge).
 */
export const StoredFiscalConfigSchema = FiscalConfigSchema.strip();

/** Resolved tax: country default + org override. */
export interface ResolvedTax {
  name: string;
  /** Fraction 0–1. */
  rate: number;
  enabled: boolean;
  /** Unevaluated condition (e.g. `"payment_currency !== 'VES'"`). */
  condition?: string;
  /**
   * `'gross_first'` = EXTRACTED from total charged before decomposing the
   * rest (`computeInclusiveTaxes`). Applies to conditional taxes (VE IGTF).
   */
  basis?: 'gross_first';
  /** Activation subject to explicit friction (manual rate + confirmation). */
  requiresConfirmation?: boolean;
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
 * Resolves fiscal profile: defaults from `COUNTRIES[countryCode]` +
 * org override (matched by `name`; unknown taxes are
 * ignored). Unknown `countryCode` → visible error, never default.
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
  // `fiscalConfig` is nullable jsonb: null and undefined mean "no
  // override" (country defaults), not an invalid empty object.
  const config: FiscalConfig =
    fiscalConfig == null ? {} : FiscalConfigSchema.parse(fiscalConfig);
  const isFormalTaxpayer = config.isFormalTaxpayer ?? false;
  const confirmed = new Set(config.confirmedTaxes ?? []);

  // D1 (frozen): an issuer who did NOT declare being a formal taxpayer
  // cannot charge or declare taxes → country taxes are born
  // DISABLED (never a breakdown stating a false fiscal reality).
  const taxes: ResolvedTax[] = [
    ...country.countryTaxes.map((t) => ({
      name: t.name,
      rate: parseRateValue(t.value),
      enabled: isFormalTaxpayer,
    })),
    // D2 (frozen): conditional taxes are ALWAYS born disabled, never
    // automatic (country rate is reference, not effective value).
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

  // Defensive normalization (D6): STORED configuration must never
  // activate taxes the issuer did not declare — covers rows written before
  // this rule. Visible error happens on write (400
  // `TAXES_REQUIRE_FORMAL_TAXPAYER`); here read is closed.
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

/** Violation codes when writing `fiscalConfig` (used by API → 400). */
export type FiscalWriteViolationCode =
  | 'TAXES_REQUIRE_FORMAL_TAXPAYER'
  | 'TAX_REQUIRES_CONFIRMATION';

/**
 * Validates the `fiscalConfig` to be PERSISTED (not the incoming body: a
 * partial update does not know stored `isFormalTaxpayer`, so caller must
 * pass merge result — D6). Returns violation or `null`.
 *
 * Fail-closed invariant: override can only REDUCE tax burden. A
 * formal taxpayer with exempt activity disables taxes (allowed);
 * a non-taxpayer can never activate them.
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

/** Previewed tax breakdown (integer cents). */
export interface PreviewTaxesResult {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
}

/**
 * Previews taxes in AUTOMATIC mode for total charged (tax-INCLUSIVE).
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
