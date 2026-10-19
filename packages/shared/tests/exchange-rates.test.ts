/**
 * Exchange-rate cache and payment conversion view.
 *
 * Contract (RD-154): the provider is the only source of truth. A failure may
 * reuse the last successful response for the SAME base currency (explicitly
 * marked stale); otherwise the caller must block the payment. No `?? 1`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryExchangeRatesStore,
  exchangeRateAppliedValue,
  exchangeRatesFreshKey,
  exchangeRatesLastKnownKey,
  loadExchangeRates,
  paymentConversionView,
  type ExchangeRateSnapshot,
  type ExchangeRatesStore,
} from '../src/exchange-rates';

function fakeStore(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  const store: ExchangeRatesStore = {
    async get<T>(key: string) {
      return (values.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      values.set(key, value);
    },
  };
  return { store, values };
}

const success = {
  rates: { USD: 1, VES: 36.5, PEN: 3.75 },
  providerUpdatedAt: 1_700_000_000_000,
};

describe('loadExchangeRates', () => {
  it('returns the fresh cache without calling the provider', async () => {
    const { store } = fakeStore({
      [exchangeRatesFreshKey('USD')]: success,
    });
    const fetchRates = vi.fn();

    const snapshot = await loadExchangeRates({
      baseCurrency: 'USD',
      store,
      fetchRates,
      ttlSeconds: 3600,
      lastKnownTtlSeconds: 86_400,
    });

    expect(fetchRates).not.toHaveBeenCalled();
    expect(snapshot).toEqual({
      baseCurrency: 'USD',
      rates: success.rates,
      stale: false,
      providerUpdatedAt: success.providerUpdatedAt,
    });
  });

  it('accepts a legacy plain rate map in the fresh cache', async () => {
    const { store } = fakeStore({
      [exchangeRatesFreshKey('USD')]: { USD: 1, VES: 10 },
    });
    const fetchRates = vi.fn();

    const snapshot = await loadExchangeRates({
      baseCurrency: 'USD',
      store,
      fetchRates,
      ttlSeconds: 3600,
      lastKnownTtlSeconds: 86_400,
    });

    expect(fetchRates).not.toHaveBeenCalled();
    expect(snapshot.rates.VES).toBe(10);
    expect(snapshot.stale).toBe(false);
  });

  it('stores the successful response as fresh AND last known', async () => {
    const { store, values } = fakeStore();
    const fetchRates = vi.fn().mockResolvedValue(success);

    const snapshot = await loadExchangeRates({
      baseCurrency: 'USD',
      store,
      fetchRates,
      ttlSeconds: 3600,
      lastKnownTtlSeconds: 86_400,
    });

    expect(fetchRates).toHaveBeenCalledWith('USD');
    expect(snapshot.stale).toBe(false);
    expect(values.get(exchangeRatesFreshKey('USD'))).toEqual(success);
    expect(values.get(exchangeRatesLastKnownKey('USD'))).toEqual(success);
  });

  it('falls back to the last known rate of the SAME base when the provider fails', async () => {
    const { store } = fakeStore({
      [exchangeRatesLastKnownKey('USD')]: success,
    });

    const snapshot = await loadExchangeRates({
      baseCurrency: 'USD',
      store,
      fetchRates: vi.fn().mockRejectedValue(new Error('provider down')),
      ttlSeconds: 3600,
      lastKnownTtlSeconds: 86_400,
    });

    expect(snapshot).toEqual({
      baseCurrency: 'USD',
      rates: success.rates,
      stale: true,
      providerUpdatedAt: success.providerUpdatedAt,
    });
  });

  it('never reuses the last known rate of another base currency', async () => {
    const { store } = fakeStore({
      [exchangeRatesLastKnownKey('USD')]: success,
    });

    await expect(
      loadExchangeRates({
        baseCurrency: 'VES',
        store,
        fetchRates: vi.fn().mockRejectedValue(new Error('provider down')),
        ttlSeconds: 3600,
        lastKnownTtlSeconds: 86_400,
      }),
    ).rejects.toThrow('provider down');
  });

  it('uses the last known rate of the requested base, not another one', async () => {
    const { store } = fakeStore({
      [exchangeRatesLastKnownKey('USD')]: success,
      [exchangeRatesLastKnownKey('PEN')]: {
        rates: { PEN: 1, VES: 9.8 },
        providerUpdatedAt: 1_700_000_000_000,
      },
    });

    const snapshot = await loadExchangeRates({
      baseCurrency: 'PEN',
      store,
      fetchRates: vi.fn().mockRejectedValue(new Error('provider down')),
      ttlSeconds: 3600,
      lastKnownTtlSeconds: 86_400,
    });

    expect(snapshot.rates).toEqual({ PEN: 1, VES: 9.8 });
    expect(snapshot.stale).toBe(true);
  });

  it('throws when the provider fails and there is no last known rate', async () => {
    const { store } = fakeStore();
    const failure = new Error('provider down');

    await expect(
      loadExchangeRates({
        baseCurrency: 'VES',
        store,
        fetchRates: vi.fn().mockRejectedValue(failure),
        ttlSeconds: 3600,
        lastKnownTtlSeconds: 86_400,
      }),
    ).rejects.toThrow('provider down');
  });

  it('throws when the provider succeeds without usable rates and there is no cache', async () => {
    const { store } = fakeStore();

    await expect(
      loadExchangeRates({
        baseCurrency: 'USD',
        store,
        fetchRates: vi.fn().mockResolvedValue({ rates: {}, providerUpdatedAt: null }),
        ttlSeconds: 3600,
        lastKnownTtlSeconds: 86_400,
      }),
    ).rejects.toThrow('no usable rates for USD');
  });
});

describe('createMemoryExchangeRatesStore', () => {
  it('expires entries after their TTL', async () => {
    let now = 1_000;
    const store = createMemoryExchangeRatesStore(() => now);

    await store.set('rates:USD', { USD: 1 }, 60);
    expect(await store.get('rates:USD')).toEqual({ USD: 1 });

    now += 60_001;
    expect(await store.get('rates:USD')).toBeNull();
  });
});

const snapshot: ExchangeRateSnapshot = {
  baseCurrency: 'USD',
  rates: { USD: 1, VES: 36.5 },
  stale: false,
  providerUpdatedAt: 1_700_000_000_000,
};

describe('paymentConversionView', () => {
  it('hides the rate and converted amount when the currency matches the plan', () => {
    const view = paymentConversionView('USD', 'USD', null, 'idle');

    expect(view).toEqual({
      required: false,
      conversionBlock: 'hidden',
      rate: 1,
      stale: false,
      providerUpdatedAt: null,
      canSubmit: true,
    });
  });

  it('exposes the API rate as read-only when the currency differs', () => {
    const view = paymentConversionView('USD', 'VES', snapshot, 'ready');

    expect(view.required).toBe(true);
    expect(view.conversionBlock).toBe('readonly');
    expect(view.rate).toBe(36.5);
    expect(view.canSubmit).toBe(true);
  });

  it('blocks submission while the rate is loading', () => {
    const view = paymentConversionView('USD', 'VES', null, 'loading');

    expect(view.rate).toBeNull();
    expect(view.canSubmit).toBe(false);
  });

  it('blocks submission when the provider failed and there is no cached rate', () => {
    const view = paymentConversionView('USD', 'VES', null, 'error');

    expect(view.rate).toBeNull();
    expect(view.canSubmit).toBe(false);
  });

  it('blocks submission when the response does not include the payment currency', () => {
    const view = paymentConversionView('USD', 'COP', snapshot, 'ready');

    expect(view.rate).toBeNull();
    expect(view.canSubmit).toBe(false);
  });

  it('allows submission with a stale rate and keeps its provenance', () => {
    const view = paymentConversionView(
      'USD',
      'VES',
      { ...snapshot, stale: true },
      'ready',
    );

    expect(view.rate).toBe(36.5);
    expect(view.stale).toBe(true);
    expect(view.providerUpdatedAt).toBe(1_700_000_000_000);
    expect(view.canSubmit).toBe(true);
  });
});

describe('exchangeRateAppliedValue', () => {
  it('persists the exact API rate for a cross-currency payment', () => {
    expect(exchangeRateAppliedValue(paymentConversionView('USD', 'VES', snapshot, 'ready'))).toBe(
      '36.5',
    );
  });

  it('does not persist a rate when both currencies are the same', () => {
    expect(exchangeRateAppliedValue(paymentConversionView('USD', 'USD', null, 'idle'))).toBeUndefined();
  });

  it('refuses to build a converted payment without a rate', () => {
    expect(() =>
      exchangeRateAppliedValue(paymentConversionView('USD', 'VES', null, 'error')),
    ).toThrow('without an exchange rate');
  });
});
