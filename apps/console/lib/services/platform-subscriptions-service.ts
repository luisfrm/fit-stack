import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  PlatformSubscriptionStatus,
  IPaginatedResult,
  IPlatformSubscription,
  IPlatformSubscriptionPayment,
  PaymentStatus,
} from "@workspace/shared/types";

export type SubscriptionWithDetails = IPlatformSubscription;
export type PaginatedSubscriptions = IPaginatedResult<IPlatformSubscription>;
export type PlatformPayment = IPlatformSubscriptionPayment;
export type PaginatedPayments = IPaginatedResult<IPlatformSubscriptionPayment>;

export interface SubscriptionFilters {
  status?: PlatformSubscriptionStatus | "all";
  planId?: number;
  organizationId?: string;
  isTrial?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SubscriptionStats {
  active: number;
  trial: number;
  pastDue: number;
  readOnly: number;
  suspended: number;
  cancelled: number;
  total: number;
}

export interface PlatformPaymentPayload {
  amountPaidCents: number;
  currencyPaid: string;
  exchangeRateApplied?: string;
  baseAmountCents?: number;
  paymentMethod: string;
  paymentMethodDetails?: Record<string, any>;
  status: PaymentStatus;
  paymentDate?: string;
}

export interface CreatePlatformSubscriptionPayload {
  organizationId: string;
  planId: number;
  startDate?: string;
  isTrial?: boolean;
  priceOverrideCents?: number;
  payment: PlatformPaymentPayload;
}

export interface ChangePlanPayload {
  newPlanId: number;
  isTrial?: boolean;
  priceOverrideCents?: number;
  payment: PlatformPaymentPayload;
}

const SUBSCRIPTIONS_PATH = "/platform/subscriptions";

function buildQuery(filters: SubscriptionFilters) {
  const q: Record<string, string | number | boolean> = {};
  if (filters.page) q.page = filters.page;
  if (filters.limit) q.limit = filters.limit;
  if (filters.status && filters.status !== "all") q.status = filters.status;
  if (filters.planId) q.planId = filters.planId;
  if (filters.organizationId) q.organizationId = filters.organizationId;
  if (filters.isTrial !== undefined) q.isTrial = filters.isTrial;
  if (filters.search) q.search = filters.search;
  return q;
}

/**
 * Service to manage platform subscriptions, payments and billing stats.
 */
export const platformSubscriptionsService = {
  /**
   * Retrieves a paginated list of subscriptions filtered by status, plan, or search query.
   */
  async getAll(
    filters: SubscriptionFilters = {},
    options?: ApiFetchOptions,
  ): Promise<PaginatedSubscriptions> {
    return await api<PaginatedSubscriptions>(SUBSCRIPTIONS_PATH, {
      query: buildQuery(filters),
      ...options,
    });
  },

  /**
   * Retrieves detailed subscription information by ID.
   */
  async getById(
    id: number,
    options?: ApiFetchOptions,
  ): Promise<IPlatformSubscription> {
    return await api<IPlatformSubscription>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
      options,
    );
  },

  /**
   * Retrieves all subscriptions for a specific organization.
   */
  async getByOrganization(
    organizationId: string,
    options?: ApiFetchOptions,
  ): Promise<IPlatformSubscription[]> {
    return await api<IPlatformSubscription[]>(SUBSCRIPTIONS_PATH, {
      query: { organizationId },
      ...options,
    });
  },

  /**
   * Retrieves the latest active subscription for a specific organization.
   */
  async getActiveByOrganization(
    organizationId: string,
    options?: ApiFetchOptions,
  ): Promise<IPlatformSubscription | null> {
    return await api<IPlatformSubscription | null>(
      `${SUBSCRIPTIONS_PATH}/by-organization/${organizationId}/active`,
      options,
    );
  },

  /**
   * Creates a new platform subscription with its first payment (atomic).
   * Supports trial and free plans automatically.
   */
  async create(
    data: CreatePlatformSubscriptionPayload,
  ): Promise<IPlatformSubscription> {
    return await api<IPlatformSubscription>(SUBSCRIPTIONS_PATH, {
      method: "POST",
      body: data,
    });
  },

  /**
   * Renews an existing subscription under the same plan (cumulative extension).
   */
  async renew(
    id: number,
    payment: PlatformPaymentPayload,
  ): Promise<{ success: boolean; newPeriodEnd: string }> {
    return await api<{ success: boolean; newPeriodEnd: string }>(
      `${SUBSCRIPTIONS_PATH}/${id}/renew`,
      { method: "POST", body: { payment } },
    );
  },

  /**
   * Changes the plan for an organization (cancels current, creates new).
   */
  async changePlan(
    organizationId: string,
    data: ChangePlanPayload,
  ): Promise<IPlatformSubscription> {
    return await api<IPlatformSubscription>(
      `${SUBSCRIPTIONS_PATH}/change-plan`,
      { method: "POST", body: { organizationId, ...data } },
    );
  },

  /**
   * Cancels an active platform subscription.
   */
  async cancel(id: number, reason?: string): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}/cancel`, {
      method: "POST",
      body: { reason },
    });
  },

  /**
   * Extends the period end of a subscription (admin override).
   */
  async extend(id: number, newEndDate: string): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}/extend`, {
      method: "POST",
      body: { newEndDate },
    });
  },

  /**
   * Deletes a subscription record.
   */
  async delete(id: number): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}`, { method: "DELETE" });
  },

  /**
   * Retrieves KPI statistics.
   */
  async getStats(options?: ApiFetchOptions): Promise<SubscriptionStats> {
    return await api<SubscriptionStats>(
      `${SUBSCRIPTIONS_PATH}/stats`,
      options,
    );
  },

  /* ── Payments ── */

  /**
   * Retrieves the payment history for a subscription.
   */
  async getPayments(
    subscriptionId: number,
    options?: ApiFetchOptions,
  ): Promise<IPlatformSubscriptionPayment[]> {
    return await api<IPlatformSubscriptionPayment[]>(
      `${SUBSCRIPTIONS_PATH}/${subscriptionId}/payments`,
      options,
    );
  },

  /**
   * Registers a new payment for an existing subscription.
   */
  async addPayment(
    subscriptionId: number,
    payment: PlatformPaymentPayload,
  ): Promise<{ success: boolean; paymentId: number }> {
    return await api<{ success: boolean; paymentId: number }>(
      `${SUBSCRIPTIONS_PATH}/${subscriptionId}/payments`,
      { method: "POST", body: payment },
    );
  },

  /**
   * Updates the status of an existing payment.
   */
  async updatePaymentStatus(
    paymentId: number,
    status: PaymentStatus,
  ): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/payments/${paymentId}/status`, {
      method: "PATCH",
      body: { status },
    });
  },
};
