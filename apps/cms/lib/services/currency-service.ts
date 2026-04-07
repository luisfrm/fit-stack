import axios from "axios";
import { EUR_EXCHANGE_URL } from "../config/constants";

export interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

/**
 * Service to handle external currency exchange rate fetching.
 */
export const currencyService = {
  /**
   * Fetches the latest exchange rates for a given base currency.
   * @param url The endpoint to fetch rates from (default: EUR_EXCHANGE_URL)
   * @returns Exchange rate data
   */
  getExchangeRates: async (url: string = EUR_EXCHANGE_URL): Promise<ExchangeRatesResponse> => {
    // We use direct axios here because apiClient has a fixed baseURL for our own API
    const { data } = await axios.get<ExchangeRatesResponse>(url);
    return data;
  }
};
