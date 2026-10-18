/**
 * Pure helpers for the organization primary currency (RD-146).
 *
 * The currency universe is `COUNTRY_INDEX.currencies` (derived from
 * `COUNTRIES`); the active list is the authority for which currencies an org
 * may charge in. Both `absent` and `invalid` configuration are explicit errors,
 * never silent defaults.
 */
import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  assertSupportedCurrency,
  parseActiveCurrencies,
} from '../../src/services/organizations.service';

interface HttpErrorBody {
  code?: string;
  fields?: string[];
}

async function captureHttpError(fn: () => void): Promise<{
  status: number;
  body: HttpErrorBody;
}> {
  try {
    fn();
  } catch (error) {
    if (error instanceof HTTPException && error.res) {
      return {
        status: error.status,
        body: (await error.res.clone().json()) as HttpErrorBody,
      };
    }
    throw error;
  }
  throw new Error('Expected an HTTPException, none was thrown');
}

describe('assertSupportedCurrency', () => {
  it('accepts currencies declared by COUNTRIES', () => {
    expect(() => assertSupportedCurrency('USD')).not.toThrow();
    expect(() => assertSupportedCurrency('VES')).not.toThrow();
    expect(() => assertSupportedCurrency('PEN')).not.toThrow();
  });

  it('rejects an unknown currency with 400 UNSUPPORTED_CURRENCY', async () => {
    const error = await captureHttpError(() => assertSupportedCurrency('XXX'));
    expect(error.status).toBe(400);
    expect(error.body.code).toBe('UNSUPPORTED_CURRENCY');
    expect(error.body.fields).toEqual(['primaryCurrency']);
  });
});

describe('parseActiveCurrencies', () => {
  it('returns null when the setting does not exist (caller decides the error)', () => {
    expect(parseActiveCurrencies(undefined)).toBeNull();
  });

  it('parses a JSON array of currency codes', () => {
    expect(parseActiveCurrencies('["USD","VES"]')).toEqual(['USD', 'VES']);
  });

  it('rejects malformed JSON with 400 ACTIVE_CURRENCIES_NOT_CONFIGURED', async () => {
    const error = await captureHttpError(() => parseActiveCurrencies('not-json'));
    expect(error.status).toBe(400);
    expect(error.body.code).toBe('ACTIVE_CURRENCIES_NOT_CONFIGURED');
  });

  it('rejects an empty or non-string list instead of widening silently', async () => {
    for (const raw of ['[]', '{}', '[1,2]', '["USD",null]', '[""]']) {
      const error = await captureHttpError(() => parseActiveCurrencies(raw));
      expect(error.body.code).toBe('ACTIVE_CURRENCIES_NOT_CONFIGURED');
    }
  });
});
