import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  ISubscription,
  SubscriptionStatus,
  PaginatedSubscriptions,
  SubscriptionsFilter,
  IRecentRegistration,
} from "@workspace/shared/types";

const SUBSCRIPTIONS_PATH = "/subscriptions";

export const subscriptionsService = {
  async getAll(
    params?: SubscriptionsFilter,
    options?: ApiFetchOptions,
  ): Promise<PaginatedSubscriptions> {
    return await api<PaginatedSubscriptions>(SUBSCRIPTIONS_PATH, {
      query: params,
      ...options,
    });
  },

  async create(
    subscription: Omit<ISubscription, "id" | "memberName" | "planName">,
  ): Promise<ISubscription> {
    return await api<ISubscription>(SUBSCRIPTIONS_PATH, {
      method: "POST",
      body: subscription,
    });
  },

  async updateStatus(
    id: number,
    status: SubscriptionStatus,
  ): Promise<ISubscription> {
    return await api<ISubscription>(`${SUBSCRIPTIONS_PATH}/${id}`, {
      method: "PUT",
      body: { status },
    });
  },

  // No `delete`: a payment record is never removed. The charge is voided
  // (`financeService.updatePaymentStatus(id, 'voided', reason)` — the reason is
  // mandatory since RD-163) or access is revoked (`updateStatus(id, 'cancelled')`).

  async getRecent(
    limit: number = 5,
    options?: ApiFetchOptions,
  ): Promise<IRecentRegistration[]> {
    return await api<IRecentRegistration[]>(`${SUBSCRIPTIONS_PATH}/recent`, {
      query: { limit },
      ...options,
    });
  },
};
