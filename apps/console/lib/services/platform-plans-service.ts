import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IPlatformPlan } from "@workspace/shared/types";

const PLATFORM_PLANS_PATH = "/platform/plans";

export interface PlatformPlanWithStats extends IPlatformPlan {
  organizationCount: number;
}

export interface PlatformPlansSummary {
  totalPlans: number;
  activePlans: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  monthlyRevenue: Record<string, number>;
  trialPlans: number;
}

/**
 * Service to manage platform plans catalog and plan statistics.
 */
export const platformPlansService = {
  /**
   * Retrieves all platform plans.
   */
  async getAll(options?: ApiFetchOptions): Promise<IPlatformPlan[]> {
    return await api<IPlatformPlan[]>(PLATFORM_PLANS_PATH, options);
  },

  /**
   * Retrieves all platform plans enriched with usage statistics.
   */
  async getAllWithStats(
    options?: ApiFetchOptions,
  ): Promise<PlatformPlanWithStats[]> {
    return await api<PlatformPlanWithStats[]>(
      `${PLATFORM_PLANS_PATH}/with-stats`,
      options,
    );
  },

  /**
   * Retrieves high-level platform plans summary statistics.
   */
  async getSummary(options?: ApiFetchOptions): Promise<PlatformPlansSummary> {
    return await api<PlatformPlansSummary>(
      `${PLATFORM_PLANS_PATH}/summary`,
      options,
    );
  },

  /**
   * Retrieves a single platform plan by ID.
   */
  async getById(
    id: number,
    options?: ApiFetchOptions,
  ): Promise<IPlatformPlan> {
    return await api<IPlatformPlan>(
      `${PLATFORM_PLANS_PATH}/${id}`,
      options,
    );
  },

  /**
   * Creates a new platform plan in the catalog.
   */
  async create(
    data: Omit<IPlatformPlan, "id" | "createdAt">,
  ): Promise<IPlatformPlan> {
    return await api<IPlatformPlan>(PLATFORM_PLANS_PATH, {
      method: "POST",
      body: data,
    });
  },

  /**
   * Updates an existing platform plan.
   */
  async update(
    id: number,
    data: Partial<IPlatformPlan>,
  ): Promise<IPlatformPlan> {
    return await api<IPlatformPlan>(`${PLATFORM_PLANS_PATH}/${id}`, {
      method: "PATCH",
      body: data,
    });
  },

  /**
   * Deletes a platform plan by ID.
   */
  async delete(id: number): Promise<void> {
    await api(`${PLATFORM_PLANS_PATH}/${id}`, { method: "DELETE" });
  },
};

