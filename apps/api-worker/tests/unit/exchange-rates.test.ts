/**
 * RD-154 — typed exchange-rate failures and their HTTP mapping.
 *
 * The provider must fail VISIBLY (a rate is never assumed): a total outage is
 * `ExchangeRateUnavailableError` → `503 EXCHANGE_RATE_UNAVAILABLE`; a missing
 * target currency in an otherwise successful response is
 * `UnsupportedPaymentCurrencyError` → `400 PAYMENT_CURRENCY_UNSUPPORTED`.
 * Routes map by class (`exchangeRateErrorResponse`), never by message text.
 *
 * No Redis in the test env: `createCache({})` degrades to a no-op, so every
 * call reaches the mocked provider — exactly what we want to exercise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ofetchMock } = vi.hoisted(() => ({ ofetchMock: vi.fn() }));
vi.mock('ofetch', () => ({ ofetch: ofetchMock }));

import {
  createExchangeRateProvider,
  ExchangeRateUnavailableError,
  UnsupportedPaymentCurrencyError,
  exchangeRateErrorResponse,
} from '../../src/lib/exchange-rates';
import type { Env } from '../../src/lib/env';

const buildProvider = () => createExchangeRateProvider({} as Env);

async function rejectionOf(promise: Promise<unknown>): Promise<{
  name?: string;
  code?: string;
}> {
  try {
    await promise;
  } catch (err) {
    return err as { name?: string; code?: string };
  }
  throw new Error('expected the call to reject');
}

describe('createExchangeRateProvider', () => {
  beforeEach(() => ofetchMock.mockReset());

  it('same currency resolves to 1 without calling the provider', async () => {
    await expect(buildProvider().getRate('USD', 'USD')).resolves.toBe(1);
    expect(ofetchMock).not.toHaveBeenCalled();
  });

  it('returns the provider rate for a covered target', async () => {
    ofetchMock.mockResolvedValueOnce({
      result: 'success',
      base_code: 'USD',
      rates: { VES: 36.5 },
      time_last_update_unix: 1_700_000_000,
    });
    await expect(buildProvider().getRate('USD', 'VES')).resolves.toBe(36.5);
  });

  it('provider outage rejects with ExchangeRateUnavailableError', async () => {
    ofetchMock.mockRejectedValueOnce(new Error('network down'));
    const err = await rejectionOf(buildProvider().getRate('USD', 'VES'));
    expect(err).toBeInstanceOf(ExchangeRateUnavailableError);
    expect(err.code).toBe('EXCHANGE_RATE_UNAVAILABLE');
  });

  it('non-success payload rejects with ExchangeRateUnavailableError', async () => {
    ofetchMock.mockResolvedValueOnce({ result: 'error', base_code: 'USD', rates: {} });
    await expect(buildProvider().getRate('USD', 'VES')).rejects.toBeInstanceOf(
      ExchangeRateUnavailableError,
    );
  });

  it('target missing from the response rejects with UnsupportedPaymentCurrencyError', async () => {
    ofetchMock.mockResolvedValueOnce({
      result: 'success',
      base_code: 'USD',
      rates: { EUR: 0.9 },
    });
    const err = await rejectionOf(buildProvider().getRate('USD', 'VES'));
    expect(err).toBeInstanceOf(UnsupportedPaymentCurrencyError);
    expect(err.code).toBe('PAYMENT_CURRENCY_UNSUPPORTED');
  });
});

describe('exchangeRateErrorResponse', () => {
  it('maps the outage to 503 with a stable business code', () => {
    expect(exchangeRateErrorResponse(new ExchangeRateUnavailableError('USD'))).toEqual({
      status: 503,
      body: { error: expect.any(String), code: 'EXCHANGE_RATE_UNAVAILABLE' },
    });
  });

  it('maps the unsupported currency to 400 with a stable business code', () => {
    expect(
      exchangeRateErrorResponse(new UnsupportedPaymentCurrencyError('USD', 'VES')),
    ).toEqual({
      status: 400,
      body: { error: expect.any(String), code: 'PAYMENT_CURRENCY_UNSUPPORTED' },
    });
  });

  it('returns null for unrelated errors (caller rethrows)', () => {
    expect(exchangeRateErrorResponse(new Error('boom'))).toBeNull();
  });
});
