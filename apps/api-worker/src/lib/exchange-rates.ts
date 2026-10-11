import { ofetch } from 'ofetch';
import type { Env } from './env';
import { createCache } from './cache';

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

const DEFAULT_URL = 'https://open.er-api.com/v6/latest';

/**
 * Server-side exchange rates provider (open.er-api.com, same provider
 * used by frontend). Exchange rates for renewals are calculated by backend —
 * NEVER accepted from request body — and cached in Redis (`rates:{base}`, 1h).
 * `EXCHANGE_API_URL` allows pointing to mock in tests.
 */
export function createExchangeRateProvider(env: Env) {
  const cache = createCache(env);
  const baseUrl = env.EXCHANGE_API_URL ?? DEFAULT_URL;

  return {
    /**
     * How many units of `target` equal 1 unit of `base`.
     * rate = 1 if base === target (no external call).
     * Throws if external API fails or does not support currency.
     */
    async getRate(base: string, target: string): Promise<number> {
      if (base === target) return 1;

      const cacheKey = `rates:${base}`;
      const cached = await cache.get<Record<string, number>>(cacheKey);
      let rates = cached;
      if (!rates) {
        const data = await ofetch<ExchangeRatesResponse>(`${baseUrl}/${base}`);
        if (data?.result !== 'success' || !data.rates) {
          throw new Error('Exchange rate API unavailable');
        }
        rates = data.rates;
        await cache.set(cacheKey, rates, 3600);
      }

      const rate = rates[target];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`No exchange rate for ${base} -> ${target}`);
      }
      return rate;
    },
  };
}

export type ExchangeRateProvider = ReturnType<typeof createExchangeRateProvider>;