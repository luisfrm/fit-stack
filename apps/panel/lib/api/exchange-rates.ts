import { ofetch } from "ofetch";
import {
  createMemoryExchangeRatesStore,
  loadExchangeRates,
  type ExchangeRateSnapshot,
} from "@workspace/shared";

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix?: number;
}

const DEFAULT_URL = "https://open.er-api.com/v6/latest";
const FRESH_TTL_SECONDS = 3600;
// Last successful response is kept to survive provider outages. It is only
// read on the failure path and is always flagged as stale.
const LAST_KNOWN_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * External exchange-rates API (open.er-api.com) — NOT the Fit-Stack API,
 * so it uses plain ofetch (no session cookies, no internal baseURL).
 * `next: { revalidate }` keeps Next.js caching on RSC calls.
 */
const store = createMemoryExchangeRatesStore();

/**
 * Rates plus provenance. Throws when the provider fails AND there is no
 * last-known response for the same base currency — callers must block the
 * payment instead of assuming a rate.
 */
export async function getExchangeRateSnapshot(
  baseCurrency: string = "USD",
): Promise<ExchangeRateSnapshot> {
  return loadExchangeRates({
    baseCurrency,
    store,
    ttlSeconds: FRESH_TTL_SECONDS,
    lastKnownTtlSeconds: LAST_KNOWN_TTL_SECONDS,
    fetchRates: async (base) => {
      const url = `${process.env.NEXT_PUBLIC_EXCHANGE_URL ?? DEFAULT_URL}/${base}`;
      const data = await ofetch<ExchangeRatesResponse>(url, {
        next: { revalidate: FRESH_TTL_SECONDS },
      });
      if (data?.result !== "success" || !data.rates) {
        throw new Error(`Exchange rate API unavailable for ${base}`);
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

/**
 * Rates only (backward-compatible helper for display flows).
 * Throws when neither the provider nor a last-known rate is available.
 */
export async function getExchangeRates(
  baseCurrency: string = "USD",
): Promise<Record<string, number>> {
  return (await getExchangeRateSnapshot(baseCurrency)).rates;
}
