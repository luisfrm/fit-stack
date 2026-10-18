import { ofetch } from 'ofetch';
import { loadExchangeRates, type ExchangeRatesCacheEntry } from '@workspace/shared';
import type { Env } from './env';
import { createCache } from './cache';

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix?: number;
}

const DEFAULT_URL = 'https://open.er-api.com/v6/latest';
const FRESH_TTL_SECONDS = 3600;
/**
 * Last successful response, kept separately from the fresh cache. It is only
 * read when the provider fails and is always traced with a warning.
 */
const LAST_KNOWN_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Server-side exchange rates provider (open.er-api.com, same provider
 * used by frontend). Exchange rates for renewals are calculated by backend —
 * NEVER accepted from request body — and cached in Redis (`rates:{base}`, 1h).
 * A provider failure reuses the last known response for the SAME base
 * (`rates:last:{base}`) and logs it. Without a last known response the call
 * throws: renewals must fail visibly, never with an assumed rate.
 * `EXCHANGE_API_URL` allows pointing to mock in tests.
 */
export function createExchangeRateProvider(env: Env) {
  const cache = createCache(env);
  const baseUrl = env.EXCHANGE_API_URL ?? DEFAULT_URL;

  async function loadSnapshot(base: string) {
    return loadExchangeRates({
      baseCurrency: base,
      store: cache,
      ttlSeconds: FRESH_TTL_SECONDS,
      lastKnownTtlSeconds: LAST_KNOWN_TTL_SECONDS,
      fetchRates: async (baseCurrency): Promise<ExchangeRatesCacheEntry> => {
        let data: ExchangeRatesResponse;
        try {
          data = await ofetch<ExchangeRatesResponse>(`${baseUrl}/${baseCurrency}`);
        } catch {
          // Normalized so the routes can map provider outages to 503.
          throw new Error('Exchange rate API unavailable');
        }
        if (data?.result !== 'success' || !data.rates) {
          throw new Error('Exchange rate API unavailable');
        }
        return {
          rates: data.rates,
          providerUpdatedAt: data.time_last_update_unix
            ? data.time_last_update_unix * 1000
            : null,
        };
      },
    });
  }

  return {
    /**
     * How many units of `target` equal 1 unit of `base`.
     * rate = 1 if base === target (no external call).
     * Throws if external API fails, no last known rate exists, or the
     * response does not support the target currency.
     */
    async getRate(base: string, target: string): Promise<number> {
      if (base === target) return 1;

      const snapshot = await loadSnapshot(base);
      const rate = snapshot.rates[target];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`No exchange rate for ${base} -> ${target}`);
      }

      if (snapshot.stale) {
        const updatedAt = snapshot.providerUpdatedAt
          ? new Date(snapshot.providerUpdatedAt).toISOString()
          : 'unknown';
        console.warn(
          `[EXCHANGE RATES] Provider unavailable for ${base}; using last known rates updated at ${updatedAt}`,
        );
      }

      return rate;
    },
  };
}

export type ExchangeRateProvider = ReturnType<typeof createExchangeRateProvider>;
