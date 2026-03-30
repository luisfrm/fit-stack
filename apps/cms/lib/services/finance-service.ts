import axios from "axios";
import { EUR_EXCHANGE_URL, USD_EXCHANGE_URL } from "../config/constants";
import { Currency } from "@/types/dashboard";

/**
 * Service to handle financial operations like exchange rate fetching.
 */
export const financeService = {
  /**
   * Fetches the exchange rate for a given base currency and target currency.
   * Uses an external public API.
   */
  getExchangeRate: async (base: Currency, target: Currency): Promise<number> => {
    if (base === target) return 1;

    try {
      const url = base === "USD" ? USD_EXCHANGE_URL : EUR_EXCHANGE_URL;
      const { data } = await axios.get(url);
      
      // The API returns an object where 'rates' contains the conversion mappings
      const rates = data.rates || {};
      const rate = rates[target];

      if (rate === undefined) {
        console.warn(`Rate not found for ${target} with base ${base}. Defaulting to 1.`);
        return 1;
      }

      return rate;
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      // Fallback to 1 to avoid breaking calculations
      return 1;
    }
  }
};
