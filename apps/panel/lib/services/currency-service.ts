/**
 * Legacy currency service — superseded by `lib/api/exchange-rates.ts`.
 * Kept for backward compatibility with client components that still
 * import it directly. For Server Components, prefer `getExchangeRates`.
 */
import { getExchangeRates } from "@/lib/api/exchange-rates";
import { EUR_EXCHANGE_URL } from "@/lib/config/constants";

export interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

export const currencyService = {
  /**
   * Fetches the latest exchange rates for a given base currency.
   * Uses the shared `getExchangeRates` helper (cached server-side).
   */
  async getExchangeRates(
    baseCurrency: string = "USD",
  ): Promise<ExchangeRatesResponse> {
    const rates = await getExchangeRates(baseCurrency);
    return {
      result: "success",
      base_code: baseCurrency,
      rates,
      time_last_update_unix: Math.floor(Date.now() / 1000),
    };
  },
};
