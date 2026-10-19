import { COUNTRIES, DEFAULT_COUNTRY } from './constants';

/**
 * Configuration defaults. Single source of truth to SEED settings upon
 * creating an organization (gym_setting) and upon platform initialization
 * (platform_setting). The goal is to prevent silent fallbacks in the UI
 * (`|| "USD"`, `|| "latam"`): unconfigured values must be visible errors,
 * never made-up defaults invented at read-time.
 */

/** Default currency according to country (or default country currency if unknown). */
function currencyForCountry(countryCode?: string | null): string {
  const defaultCurrency = DEFAULT_COUNTRY?.currency ?? 'USD';
  if (!countryCode) return defaultCurrency;
  return COUNTRIES[countryCode]?.currency ?? defaultCurrency;
}

/** Primary currency derived from country (used as `organization.primary_currency` upon creation). */
export function primaryCurrencyForCountry(countryCode?: string | null): string {
  return currencyForCountry(countryCode);
}

/** Active currencies: local + USD (without duplicates if local is already USD). */
function activeCurrenciesFor(primary: string, fallbacks: string[]): string {
  return JSON.stringify(Array.from(new Set([primary, ...fallbacks])));
}

/**
 * Defaults for EXTENSIBLE ORGANIZATION settings (gym_setting). Seeded
 * upon org creation. Mandatory keys (primary_currency, currency_format,
 * timezone) are NOT NULL columns in `organization` — they do not live here.
 *
 * `primaryCurrency` is OPTIONAL and explicit: Console preselects the country
 * currency but the operator can pick another one (e.g. a gym in VE that bills
 * in USD). `active_currencies` always contains the chosen primary, the country
 * currency and USD (the platform operating currency), so a cross-currency
 * organization is usable from day one (no silent currency fallback).
 */
export function buildDefaultOrgSettings(
  countryCode?: string | null,
  primaryCurrency?: string,
): Record<string, string> {
  const countryCurrency = currencyForCountry(countryCode);
  const primary = primaryCurrency ?? countryCurrency;
  return {
    active_currencies: activeCurrenciesFor(primary, [countryCurrency, 'USD']),
    active_payment_methods: '[]',
  };
}

/**
 * Defaults for PLATFORM settings (platform_setting). Seeded in `/api/init`
 * (when the first admin is created). Without defaults, the console would fall back to `|| "USD"`.
 */
export const DEFAULT_PLATFORM_SETTINGS: Record<string, string> = {
  primary_currency: 'USD',
  active_currencies: activeCurrenciesFor('USD', ['VES']),
  currency_format: 'latam',
  active_payment_methods: '[]',
  ai_provider_default: 'openrouter',
  feature_flags_free_tier_enabled: 'false',
  // FitStack emitter legal identity (Console receipts). Empty =
  // generic emitter "FitStack" + gate "Comprobante de pago" (never "Factura").
  fitstack_legal_name: '',
  fitstack_tax_id: '',
  fitstack_address: '',
  fitstack_country_code: '',
};
