import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IMembershipPlan, IMembershipsSummary } from "@workspace/shared/types";

const PLANS_PATH = "/plans";

export interface GetPlansOptions {
  includeStats?: boolean;
}

export const plansService = {
  async getAll(
    params?: GetPlansOptions,
    options?: ApiFetchOptions,
  ): Promise<IMembershipPlan[]> {
    return await api<IMembershipPlan[]>(PLANS_PATH, {
      query: params?.includeStats ? { includeStats: true } : undefined,
      ...options,
    });
  },

  async getSummary(
    options?: ApiFetchOptions,
  ): Promise<IMembershipsSummary> {
    return await api<IMembershipsSummary>(`${PLANS_PATH}/summary`, options);
  },

  async create(
    plan: Omit<IMembershipPlan, "id">,
  ): Promise<IMembershipPlan> {
    return await api<IMembershipPlan>(PLANS_PATH, {
      method: "POST",
      body: plan,
    });
  },

  async update(
    id: number,
    plan: Partial<IMembershipPlan>,
  ): Promise<IMembershipPlan> {
    return await api<IMembershipPlan>(`${PLANS_PATH}/${id}`, {
      method: "PUT",
      body: plan,
    });
  },

  async delete(id: number): Promise<void> {
    await api(`${PLANS_PATH}/${id}`, { method: "DELETE" });
  },
};
