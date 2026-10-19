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
 * Provider unreachable (no fresh response AND no last-known one for the base).
 * A rate is never assumed: callers must block the operation. Routes map it to
 * `503 EXCHANGE_RATE_UNAVAILABLE`.
 */
export class ExchangeRateUnavailableError extends Error {
  readonly code = 'EXCHANGE_RATE_UNAVAILABLE' as const;
  constructor(base: string) {
    super(`Exchange rate API unavailable for base ${base}`);
    this.name = 'ExchangeRateUnavailableError';
  }
}

/**
 * Provider reachable but the requested target currency is missing from its
 * response: the caller chose a currency the provider does not cover. Routes map
 * it to `400 PAYMENT_CURRENCY_UNSUPPORTED`.
 */
export class UnsupportedPaymentCurrencyError extends Error {
  readonly code = 'PAYMENT_CURRENCY_UNSUPPORTED' as const;
  constructor(base: string, target: string) {
    super(`No exchange rate for ${base} -> ${target}`);
    this.name = 'UnsupportedPaymentCurrencyError';
  }
}

/**
 * HTTP mapping of the typed rate failures. Single place so every route that
 * surfaces the provider answers the same way: the message is a human fallback,
 * the client resolves by `code`. `null` = not a rate failure (rethrow).
 */
export function exchangeRateErrorResponse(
  err: unknown,
): { status: 400 | 503; body: { error: string; code: string } } | null {
  if (err instanceof ExchangeRateUnavailableError) {
    return {
      status: 503,
      body: {
        error: 'Servicio de tasas de cambio no disponible, intente nuevamente',
        code: err.code,
      },
    };
  }
  if (err instanceof UnsupportedPaymentCurrencyError) {
    return {
      status: 400,
      body: {
        error: 'Moneda de pago no soportada por el proveedor de tasas',
        code: err.code,
      },
    };
  }
  return null;
}

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
          // Typed so the routes map provider outages to 503 by class, never by
          // matching the message.
          throw new ExchangeRateUnavailableError(baseCurrency);
        }
        if (data?.result !== 'success' || !data.rates) {
          throw new ExchangeRateUnavailableError(baseCurrency);
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
        throw new UnsupportedPaymentCurrencyError(base, target);
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
