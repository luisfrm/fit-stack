import { COUNTRIES, DEFAULT_COUNTRY } from './constants';

/**
 * Defaults de configuración. Son la fuente única para SEMBRAR settings al
 * crear una organización (gym_setting) y al inicializar la plataforma
 * (platform_setting). La idea es que no haya fallbacks silenciosos en la UI
 * (`|| "USD"`, `|| "latam"`): si el valor no está configurado, es un error
 * visible, no un default inventado en la lectura.
 */

/** Moneda por defecto según el país (o la del país por defecto si no se conoce). */
function currencyForCountry(countryCode?: string | null): string {
  const defaultCurrency = DEFAULT_COUNTRY?.currency ?? 'USD';
  if (!countryCode) return defaultCurrency;
  return COUNTRIES[countryCode]?.currency ?? defaultCurrency;
}

/** Active currencies: local + USD (sin duplicar si la local ya es USD). */
function activeCurrenciesFor(primary: string, fallbacks: string[]): string {
  return JSON.stringify(Array.from(new Set([primary, ...fallbacks])));
}

/**
 * Defaults de settings de ORGANIZACIÓN (gym_setting). Se siembran al crear la org,
 * derivando la moneda principal del país de operación.
 */
export function buildDefaultOrgSettings(countryCode?: string | null): Record<string, string> {
  const primary = currencyForCountry(countryCode);
  return {
    primary_currency: primary,
    active_currencies: activeCurrenciesFor(primary, ['USD']),
    currency_format: 'latam',
    active_payment_methods: '[]',
  };
}

/**
 * Defaults de settings de PLATAFORMA (platform_setting). Se siembran en `/api/init`
 * (cuando se crea el primer admin). Sin defaults, el console caería en `|| "USD"`.
 */
export const DEFAULT_PLATFORM_SETTINGS: Record<string, string> = {
  primary_currency: 'USD',
  active_currencies: activeCurrenciesFor('USD', ['VES']),
  currency_format: 'latam',
  active_payment_methods: '[]',
  ai_provider_default: 'openrouter',
  feature_flags_free_tier_enabled: 'false',
};
