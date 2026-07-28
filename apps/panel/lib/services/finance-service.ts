import { api } from "@/lib/api/client";
import { getExchangeRates } from "@/lib/api/exchange-rates";

const PAYMENTS_PATH = "/payments";
const REPORTS_PATH = "/reports";

type AnalyticsKpis = {
  todayRevenue: Array<{ currency: string; amount: number }>;
  pendingPayments: number;
  expiringSoon: number;
  activeSubscriptions: number;
};

type AnalyticsResponse = {
  kpis: AnalyticsKpis;
  plansDistribution: Array<{ planName: string; count: number }>;
  paymentMethods: Array<{
    method: string;
    count: number;
    breakdown: Record<string, number>;
  }>;
  renewals: Array<{ day: string; count: number }>;
  growth: {
    altas: Array<{ day: string; count: number }>;
    bajas: Array<{ day: string; count: number }>;
  };
  chartData: Array<{
    day: string;
    currency: string;
    amount: number;
    normalizedAmount: number;
    originalExchangeRate: string;
  }>;
};

type RevenueRow = {
  month: string;
  currency: string;
  amount: number;
  normalizedAmount: number;
  originalExchangeRate: string;
};

/**
 * Service to handle financial operations: exchange rate fetching,
 * payment status mutations, and analytics/revenue aggregations.
 */
export const financeService = {
  /**
   * Updates the status of a payment.
   */
  async updatePaymentStatus(
    paymentId: number,
    status: string,
  ): Promise<void> {
    await api(`${PAYMENTS_PATH}/${paymentId}/status`, {
      method: "POST",
      body: { status },
    });
  },

  async getAnalytics(baseCurrency: string): Promise<AnalyticsResponse> {
    const data = (await api(`${PAYMENTS_PATH}/analytics`)) as AnalyticsResponse;

    if (data.chartData && baseCurrency) {
      const currencies = Array.from(
        new Set(data.chartData.map((d) => d.currency)),
      );

      const rates: Record<string, number> = {};
      for (const curr of currencies) {
        try {
          const exchangeRates = await getExchangeRates(curr);
          rates[curr] = exchangeRates[baseCurrency] ?? 1;
        } catch {
          rates[curr] = 1;
        }
      }

      data.chartData = data.chartData.map((d) => ({
        ...d,
        normalizedAmount: d.amount * (rates[d.currency] ?? 1),
      }));
    }

    return data;
  },

  async getRevenueReport(baseCurrency: string): Promise<RevenueRow[]> {
    const data = (await api(`${REPORTS_PATH}/revenue`)) as RevenueRow[];

    if (data && baseCurrency) {
      const currencies = Array.from(
        new Set(data.map((d) => d.currency)),
      );

      const rates: Record<string, number> = {};
      for (const curr of currencies) {
        try {
          const exchangeRates = await getExchangeRates(curr);
          rates[curr] = exchangeRates[baseCurrency] ?? 1;
        } catch {
          rates[curr] = 1;
        }
      }

      return data.map((d) => ({
        ...d,
        normalizedAmount: d.amount * (rates[d.currency] ?? 1),
      }));
    }

    return data;
  },
};
