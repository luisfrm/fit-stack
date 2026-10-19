import { describe, expect, it } from 'vitest';
import {
  PLATFORM_SETTINGS_KEYS,
  requirePlatformCurrency,
  requirePlatformCurrencyFormat,
  requirePlatformSetting,
} from '../../lib/config/platform-settings';
import { currencyFormatForCountry } from '../../lib/config/organization-presets';

/**
 * AGENTS.md §10: a missing platform setting must fail VISIBLY. These helpers are
 * the only way the console resolves `primary_currency`/`currency_format`, so no
 * `|| "USD"` / `|| "latam"` can sneak back in.
 */
describe('requirePlatformSetting', () => {
  it('returns the stored value (trimmed)', () => {
    const settings = { [PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY]: '  EUR ' };
    expect(
      requirePlatformSetting(settings, PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY),
    ).toBe('EUR');
  });

  it('throws a visible error naming the missing key instead of returning a default', () => {
    expect(() =>
      requirePlatformSetting({}, PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY),
    ).toThrow(/Missing required platform setting "primary_currency"/);
  });

  it('treats a blank value as missing', () => {
    expect(() =>
      requirePlatformSetting(
        { [PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT]: '   ' },
        PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT,
      ),
    ).toThrow(/currency_format/);
  });
});

describe('requirePlatformCurrency', () => {
  it('resolves the platform operating currency from the settings', () => {
    expect(requirePlatformCurrency({ primary_currency: 'EUR' })).toBe('EUR');
  });

  it('never falls back to "USD"', () => {
    expect(() => requirePlatformCurrency({})).toThrow(/primary_currency/);
  });
});

describe('requirePlatformCurrencyFormat', () => {
  it.each(['latam', 'usa'] as const)('accepts %s', (format) => {
    expect(requirePlatformCurrencyFormat({ currency_format: format })).toBe(
      format,
    );
  });

  it('rejects a missing value instead of defaulting to "latam"', () => {
    expect(() => requirePlatformCurrencyFormat({})).toThrow(/currency_format/);
  });

  it('rejects an unknown value', () => {
    expect(() =>
      requirePlatformCurrencyFormat({ currency_format: 'emea' }),
    ).toThrow(/Invalid platform setting "currency_format"/);
  });
});

describe('currencyFormatForCountry', () => {
  it('suggests the USA convention for the United States', () => {
    expect(currencyFormatForCountry('US')).toBe('usa');
  });

  it.each(['VE', 'CO', 'MX', 'AR', 'PA', 'CL', 'PE', 'ES'])(
    'suggests the LATAM/EU convention for %s',
    (countryCode) => {
      expect(currencyFormatForCountry(countryCode)).toBe('latam');
    },
  );

  it('returns null for an unknown/absent country (no invented format)', () => {
    expect(currencyFormatForCountry('ZZ')).toBeNull();
    expect(currencyFormatForCountry(undefined)).toBeNull();
    expect(currencyFormatForCountry(null)).toBeNull();
  });
});
