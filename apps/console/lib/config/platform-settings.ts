import type { CurrencyFormat } from "@workspace/shared";

/**
 * Platform-level settings (`platform_setting`, KV singleton).
 *
 * Values are SEEDED by `/api/init` from `DEFAULT_PLATFORM_SETTINGS`
 * (`@workspace/shared/settings`). Reading them must therefore never invent a
 * value: AGENTS.md §10 requires missing configuration to fail visibly instead
 * of silently rendering `USD` / `latam`.
 */
export const PLATFORM_SETTINGS_KEYS = {
  PLATFORM_NAME: "platform_name",
  PLATFORM_LOGO: "platform_logo",
  ACTIVE_CURRENCIES: "active_currencies",
  PRIMARY_CURRENCY: "primary_currency",
  CURRENCY_FORMAT: "currency_format",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
  FEATURE_FLAGS_FREE_TIER: "feature_flags_free_tier",
  FEATURE_FLAGS_FREE_TIER_ENABLED: "feature_flags_free_tier_enabled",
  AI_PROVIDER_DEFAULT: "ai_provider_default",
  FITSTACK_LEGAL_NAME: "fitstack_legal_name",
  FITSTACK_TAX_ID: "fitstack_tax_id",
  FITSTACK_ADDRESS: "fitstack_address",
  FITSTACK_COUNTRY_CODE: "fitstack_country_code",
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTINGS_KEYS)[keyof typeof PLATFORM_SETTINGS_KEYS];

/**
 * Reads a REQUIRED platform setting, trimmed.
 *
 * @throws Error naming the missing key and the seeding command, so a fresh or
 * partially restored database is an actionable failure instead of a made-up
 * currency/format in the console.
 */
export function requirePlatformSetting(
  settings: Record<string, string>,
  key: PlatformSettingKey,
): string {
  const value = settings[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing required platform setting "${key}". Platform settings are seeded by /api/init — run it (or set the key in the platform settings) before rendering this view.`,
    );
  }
  return value;
}

/**
 * Platform operating currency (`primary_currency`), used to bill SaaS
 * subscriptions and to aggregate the console totals.
 */
export function requirePlatformCurrency(
  settings: Record<string, string>,
): string {
  return requirePlatformSetting(
    settings,
    PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY,
  );
}

/**
 * Platform currency format (`currency_format`), validated against the shared
 * union so a corrupted row fails instead of reaching `formatCents`.
 */
export function requirePlatformCurrencyFormat(
  settings: Record<string, string>,
): CurrencyFormat {
  const value = requirePlatformSetting(
    settings,
    PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT,
  );
  if (value !== "latam" && value !== "usa") {
    throw new Error(
      `Invalid platform setting "currency_format": "${value}" (expected "latam" or "usa").`,
    );
  }
  return value;
}
