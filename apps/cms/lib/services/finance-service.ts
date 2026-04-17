import axios from "axios";
import { BASE_EXCHANGE_API_URL } from "../config/constants";
import { apiClient } from "../api-client";

/**
 * Service to handle financial operations like exchange rate fetching.
 */
export const financeService = {
  /**
   * Fetches the exchange rate for a given base currency and target currency.
   * Uses an external public API.
   */
  getExchangeRate: async (base: string, target: string): Promise<number> => {
    if (base === target) return 1;

    try {
      const url = `${BASE_EXCHANGE_API_URL}/${base}`;
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
  },

  /**
   * Updates the status of a payment.
   */
  updatePaymentStatus: async (paymentId: number, status: string): Promise<void> => {
    await apiClient.post(`/payments/${paymentId}/status`, { status });
  }
};
