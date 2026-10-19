import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  IReceiptsReportFilters,
  IReceiptsReportResult,
} from "@workspace/shared/types";

const PAYMENTS_PATH = "/payments";
const REPORTS_PATH = "/reports";

type NormalizedAmounts = {
  /** Cents in the organization primary currency (exact persisted rate). */
  normalizedAmount: number;
  /** Raw cents that could not be normalized (no exact persisted rate). */
  unconvertedAmount: number;
  unconvertedCount: number;
};

type AnalyticsKpis = {
  todayRevenue: Array<{ currency: string; amount: number } & NormalizedAmounts>;
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
    originalExchangeRate: string | null;
  } & NormalizedAmounts>;
};

type RevenueRow = {
  month: string;
  currency: string;
  amount: number;
  originalExchangeRate: string | null;
} & NormalizedAmounts;

/**
 * Service to handle financial operations: exchange rate fetching,
 * payment status mutations, and analytics/revenue aggregations.
 */
/** Response of `PATCH /payments/:id/status` (see `vaults/business/PAYMENT_STATUSES.md`). */
export interface PaymentStatusResult {
  receiptVoided: boolean;
  receiptVoidReason?: "not_issued";
}

export const financeService = {
  /**
   * Updates the status of a payment (`PATCH /:id/status` — the backend does not
   * accept POST on this route).
   *
   * Returns the receipt voiding attempt result: with
   * `voided` without an issued receipt, `receiptVoided` is `false` and
   * `receiptVoidReason` is `'not_issued'` — the UI states this explicitly.
   */
  async updatePaymentStatus(
    paymentId: number,
    status: string,
    voidReason?: string,
  ): Promise<PaymentStatusResult> {
    return await api<PaymentStatusResult>(`${PAYMENTS_PATH}/${paymentId}/status`, {
      method: "PATCH",
      body: voidReason ? { status, voidReason } : { status },
    });
  },

  /**
   * Dashboard analytics. All monetary normalization (including today's
   * revenue) is resolved by the API in SQL with each payment's persisted
   * `exchange_rate_applied`; the panel NEVER fetches live rates for reports.
   */
  async getAnalytics(): Promise<AnalyticsResponse> {
    return (await api(`${PAYMENTS_PATH}/analytics`)) as AnalyticsResponse;
  },

  /**
   * Monthly revenue report, already normalized to the organization primary
   * currency with the persisted historical rate of every payment.
   */
  async getRevenueReport(): Promise<RevenueRow[]> {
    return (await api(`${REPORTS_PATH}/revenue`)) as RevenueRow[];
  },

  /**
   * Auditoría del correlativo (`GET /api/reports/receipts`).
   * Filtros en query; `options` lleva el tag de caché en RSC.
   */
  async getReceiptsReport(
    params?: IReceiptsReportFilters,
    options?: ApiFetchOptions,
  ): Promise<IReceiptsReportResult> {
    return await api<IReceiptsReportResult>(`${REPORTS_PATH}/receipts`, {
      query: params as Record<string, string | number | boolean | undefined>,
      ...options,
    });
  },
};
