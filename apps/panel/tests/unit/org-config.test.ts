import { describe, expect, it } from 'vitest';
import { requireOrgConfig, resolveOrgCurrencyFormat } from '../../lib/org-config';

/**
 * AGENTS.md §9/§10: timezone and currency format come from the organization
 * (NOT NULL columns). These are the helpers the panel uses instead of
 * `org.timezone || "America/Caracas"` / `org.currencyFormat || "latam"`.
 */
describe('requireOrgConfig', () => {
  it('returns the org config as-is when every required value is present', () => {
    expect(
      requireOrgConfig({
        countryCode: 'CO',
        timezone: 'America/Bogota',
        currencyFormat: 'usa',
        primaryCurrency: 'COP',
      }),
    ).toEqual({
      countryCode: 'CO',
      timezone: 'America/Bogota',
      currencyFormat: 'usa',
      primaryCurrency: 'COP',
    });
  });

  it('trims the values', () => {
    expect(
      requireOrgConfig({
        countryCode: ' VE ',
        timezone: ' America/Caracas ',
        currencyFormat: 'latam',
        primaryCurrency: ' VES ',
      }),
    ).toEqual({
      countryCode: 'VE',
      timezone: 'America/Caracas',
      currencyFormat: 'latam',
      primaryCurrency: 'VES',
    });
  });

  it('throws a visible error instead of falling back to "America/Caracas"/"latam"', () => {
    expect(() =>
      requireOrgConfig({
        countryCode: 'VE',
        timezone: '',
        currencyFormat: '',
        primaryCurrency: '',
      }),
    ).toThrow(/incomplete \(missing: timezone, currencyFormat, primaryCurrency\)/);
  });

  it('rejects an unknown currency format instead of defaulting it', () => {
    expect(() =>
      requireOrgConfig({
        countryCode: 'VE',
        timezone: 'America/Caracas',
        currencyFormat: 'emea',
        primaryCurrency: 'VES',
      }),
    ).toThrow(/missing: currencyFormat/);
  });

  it('fails visibly when there is no active organization', () => {
    expect(() => requireOrgConfig(null)).toThrow(/No active organization/);
    expect(() => requireOrgConfig(undefined)).toThrow(/No active organization/);
  });
});

describe('resolveOrgCurrencyFormat', () => {
  it('returns the stored format', () => {
    expect(resolveOrgCurrencyFormat({ currencyFormat: 'usa' })).toBe('usa');
    expect(resolveOrgCurrencyFormat({ currencyFormat: 'latam' })).toBe('latam');
  });

  it('returns null when the value is absent or unknown (never "latam")', () => {
    expect(resolveOrgCurrencyFormat({})).toBeNull();
    expect(resolveOrgCurrencyFormat(null)).toBeNull();
    expect(resolveOrgCurrencyFormat({ currencyFormat: 'emea' })).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(resolveOrgCurrencyFormat({ currencyFormat: ' usa ' })).toBe('usa');
  });
});
