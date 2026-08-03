/**
 * Settings keys used across Console. Organization-level settings are managed
 * per SaaS client; platform-level keys live in `./platform-settings.ts`.
 */
export const SETTINGS_KEYS = {
  BRAND_PRIMARY: "brand_primary",
  ACTIVE_CURRENCIES: "active_currencies",
  PRIMARY_CURRENCY: "primary_currency",
  CURRENCY_FORMAT: "currency_format",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
} as const;
