import { apiClient } from "@/lib/api-client";
import { PlatformSubscriptionStatus } from "@workspace/shared/types";

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

export interface PaginatedSubscriptions {
  data: SubscriptionWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SubscriptionFilters {
  status?: PlatformSubscriptionStatus | 'all';
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

export const platformSubscriptionsService = {
  async getAll(filters: SubscriptionFilters = {}): Promise<PaginatedSubscriptions> {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.planId) params.set('planId', filters.planId.toString());
    if (filters.organizationId) params.set('organizationId', filters.organizationId);
    if (filters.isTrial !== undefined) params.set('isTrial', filters.isTrial.toString());

    const response = await apiClient.get(`${SUBSCRIPTIONS_PATH}?${params.toString()}`);
    return response.data;
  },

  async getById(id: number): Promise<SubscriptionWithDetails> {
    const response = await apiClient.get(`${SUBSCRIPTIONS_PATH}/${id}`);
    return response.data;
  },

  async getByOrganization(organizationId: string): Promise<SubscriptionWithDetails[]> {
    const response = await apiClient.get(`${SUBSCRIPTIONS_PATH}?organizationId=${organizationId}`);
    return response.data.data;
  },

  async cancel(id: number, reason?: string): Promise<void> {
    await apiClient.patch(`${SUBSCRIPTIONS_PATH}/${id}`, {
      action: 'cancel',
      reason,
    });
  },

  async extend(id: number, newEndDate: string): Promise<void> {
    await apiClient.patch(`${SUBSCRIPTIONS_PATH}/${id}`, {
      action: 'extend',
      newEndDate,
    });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${SUBSCRIPTIONS_PATH}/${id}`);
  },

  async getStats(): Promise<SubscriptionStats> {
    const response = await apiClient.get(`${SUBSCRIPTIONS_PATH}/stats`);
    return response.data;
  },
};