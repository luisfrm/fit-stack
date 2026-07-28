import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { PlatformSubscriptionStatus, IPaginatedResult } from "@workspace/shared/types";

export interface SubscriptionWithDetails {
  id: number;
  organizationId: string;
  planId: number;
  status: string;
  computedStatus: PlatformSubscriptionStatus;
  startDate: string | Date;
  currentPeriodEnd: string | Date;
  isTrial: boolean;
  priceOverride: string | null;
  cancelledAt: string | Date | null;
  cancellationReason: string | null;
  createdAt: string | Date;
  organizationName: string;
  organizationSlug: string | null;
  planName: string;
  planPrice: string;
  planCurrency: string;
}

export type PaginatedSubscriptions = IPaginatedResult<SubscriptionWithDetails>;

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
  expiringSoon: number;
  suspended: number;
}

const SUBSCRIPTIONS_PATH = "/platform/subscriptions";

function buildSubscriptionQuery(filters: SubscriptionFilters) {
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
 * Service to manage platform subscriptions and billing stats for organizations.
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
      query: buildSubscriptionQuery(filters),
      ...options,
    });
  },

  /**
   * Retrieves detailed subscription information by ID.
   */
  async getById(
    id: number,
    options?: ApiFetchOptions,
  ): Promise<SubscriptionWithDetails> {
    return await api<SubscriptionWithDetails>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
      options,
    );
  },

  /**
   * Retrieves all subscriptions associated with a specific organization ID.
   */
  async getByOrganization(
    organizationId: string,
    options?: ApiFetchOptions,
  ): Promise<SubscriptionWithDetails[]> {
    return await api<PaginatedSubscriptions>(SUBSCRIPTIONS_PATH, {
      query: { organizationId },
      ...options,
    }).then((res) => res.data);
  },

  /**
   * Cancels an active platform subscription.
   */
  async cancel(id: number, reason?: string): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}`, {
      method: "PATCH",
      body: { action: "cancel", reason },
    });
  },

  /**
   * Extends the end date of an existing platform subscription.
   */
  async extend(id: number, newEndDate: string): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}`, {
      method: "PATCH",
      body: { action: "extend", newEndDate },
    });
  },

  /**
   * Deletes a subscription record.
   */
  async delete(id: number): Promise<void> {
    await api(`${SUBSCRIPTIONS_PATH}/${id}`, { method: "DELETE" });
  },

  /**
   * Retrieves platform subscription KPI statistics.
   */
  async getStats(options?: ApiFetchOptions): Promise<SubscriptionStats> {
    return await api<SubscriptionStats>(
      `${SUBSCRIPTIONS_PATH}/stats`,
      options,
    );
  },
};

