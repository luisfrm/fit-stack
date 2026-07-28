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
  },

  getAnalytics: async (baseCurrency: string): Promise<{
    kpis: {
      todayRevenue: Array<{ currency: string; amount: number }>
      pendingPayments: number
      expiringSoon: number
      activeSubscriptions: number
    }
    plansDistribution: Array<{
      planName: string
      count: number
    }>
    paymentMethods: Array<{
      method: string
      count: number
      breakdown: Record<string, number>
    }>
    renewals: Array<{
      day: string
      count: number
    }>
    growth: {
      altas: Array<{ day: string; count: number }>
      bajas: Array<{ day: string; count: number }>
    }
    chartData: Array<{
      day: string
      currency: string
      amount: number
      normalizedAmount: number
      originalExchangeRate: string
    }>
  }> => {
    const { data } = await apiClient.get("/payments/analytics");

    // Convert all chart currencies to the real base currency on the fly
    if (data.chartData && baseCurrency) {
      const currencies = Array.from(new Set(data.chartData.map((d: any) => d.currency)));
      const rates: Record<string, number> = {};

      for (const curr of currencies) {
        rates[curr as string] = await financeService.getExchangeRate(curr as string, baseCurrency);
      }

      data.chartData = data.chartData.map((d: any) => ({
        ...d,
        normalizedAmount: d.amount * (rates[d.currency] ?? 1)
      }));
    }

    return data;
  },

  getRevenueReport: async (baseCurrency: string): Promise<Array<{
    month: string
    currency: string
    amount: number
    normalizedAmount: number
    originalExchangeRate: string
  }>> => {
    const { data } = await apiClient.get("/reports/revenue");

    // Convert all chart currencies to the real base currency on the fly
    if (data && baseCurrency) {
      const currencies = Array.from(new Set(data.map((d: any) => d.currency)));
      const rates: Record<string, number> = {};

      for (const curr of currencies) {
        rates[curr as string] = await financeService.getExchangeRate(curr as string, baseCurrency);
      }

      return data.map((d: any) => ({
        ...d,
        normalizedAmount: d.amount * (rates[d.currency] ?? 1)
      }));
    }

    return data;
  }
};
