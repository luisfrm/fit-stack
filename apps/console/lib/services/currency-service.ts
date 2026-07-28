/**
 * Legacy currency service — superseded by `lib/api/exchange-rates.ts`.
 * Kept for backward compatibility with `useExchangeRates` hook (Type C pages).
 * For RSC pages, import `getExchangeRates` from `@/lib/api/exchange-rates` instead.
 */
import { ofetch } from "ofetch";
import { EUR_EXCHANGE_URL } from "@/lib/config/constants";

export interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

// Dedicated ofetch instance for external public exchange rates API.
// Does not use internal `api` client to prevent prepending local API baseURL and session headers.
const exchangeFetcher = ofetch.create({ retry: 1, timeout: 15_000 });

export const currencyService = {
  getExchangeRates: async (
    url: string = EUR_EXCHANGE_URL,
  ): Promise<ExchangeRatesResponse> => {
    return await exchangeFetcher<ExchangeRatesResponse>(url);
  },
};
