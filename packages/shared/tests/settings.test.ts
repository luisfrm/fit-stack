/**
 * Defaults for extensible organization settings (`gym_setting`).
 *
 * Contract (RD-146): the primary currency is explicit — Console preselects the
 * country currency but allows another one — and `active_currencies` always
 * contains the chosen primary, the country currency AND USD (the platform
 * operating currency).
 */
import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../src/constants';
import { buildDefaultOrgSettings, primaryCurrencyForCountry } from '../src/settings';

function activeCurrencies(settings: Record<string, string>): string[] {
  return JSON.parse(settings.active_currencies ?? '[]') as string[];
}

describe('buildDefaultOrgSettings', () => {
  it('derives the country currency when no primary is provided and keeps USD active', () => {
    const settings = buildDefaultOrgSettings('VE');
    expect(primaryCurrencyForCountry('VE')).toBe('VES');
    expect(activeCurrencies(settings)).toEqual(['VES', 'USD']);
    expect(settings.active_payment_methods).toBe('[]');
  });

  it('accepts a cross-currency primary: USD in VE keeps both currencies active', () => {
    const settings = buildDefaultOrgSettings('VE', 'USD');
    expect(activeCurrencies(settings)).toEqual(['USD', 'VES']);
  });

  it('keeps USD active for every country without duplicating it', () => {
    expect(activeCurrencies(buildDefaultOrgSettings('PE'))).toEqual(['PEN', 'USD']);
    expect(activeCurrencies(buildDefaultOrgSettings('PE', 'PEN'))).toEqual(['PEN', 'USD']);
    expect(activeCurrencies(buildDefaultOrgSettings('US', 'USD'))).toEqual(['USD']);
  });

  it('uses the explicit primary even when the country differs', () => {
    expect(activeCurrencies(buildDefaultOrgSettings('CO', 'USD'))).toEqual(['USD', 'COP']);
  });

  it('never invents a primary for an unknown country: falls back to the default country currency', () => {
    // Unknown country → `DEFAULT_COUNTRY` (VE) currency, never a made-up code.
    const settings = buildDefaultOrgSettings('XX');
    expect(activeCurrencies(settings)).toEqual([COUNTRIES.VE.currency, 'USD']);
  });
});
