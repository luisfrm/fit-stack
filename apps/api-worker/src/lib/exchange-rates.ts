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
 * Provider server-side de tasas de cambio (open.er-api.com, mismo proveedor
 * que usa el frontend). La tasa de la renovación org-scoped la calcula el
 * backend — NUNCA se acepta del body — y se cachea en Redis (`rates:{base}`, 1h).
 * `EXCHANGE_API_URL` permite apuntar a un mock en tests.
 */
export function createExchangeRateProvider(env: Env) {
  const cache = createCache(env);
  const baseUrl = env.EXCHANGE_API_URL ?? DEFAULT_URL;

  return {
    /**
     * Cuántas unidades de `target` valen 1 unidad de `base`.
     * rate = 1 si base === target (sin llamada externa).
     * Lanza si la API externa falla o no conoce la moneda.
     */
    async getRate(base: string, target: string): Promise<number> {
      if (base === target) return 1;

      const cacheKey = `rates:${base}`;
      const cached = await cache.get<Record<string, number>>(cacheKey);
      let rates = cached;
      if (!rates) {
        const data = await ofetch<ExchangeRatesResponse>(`${baseUrl}/${base}`);
        if (!data || data.result !== 'success' || !data.rates) {
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