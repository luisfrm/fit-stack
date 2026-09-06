import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IDashboardActionItem } from "@workspace/shared/types";

export interface DashboardStats {
  activeMembers: number;
  classesToday: number;
  monthlyIncome: Record<string, number>;
  membershipsExpiring: number;
}

export interface DashboardActionItems {
  expiring: IDashboardActionItem[];
  recentlyExpired: IDashboardActionItem[];
}

const DASHBOARD_PATH = "/dashboard";

export const dashboardService = {
  async getStats(
    today: string,
    options?: ApiFetchOptions,
  ): Promise<DashboardStats> {
    return await api<DashboardStats>(`${DASHBOARD_PATH}/stats`, {
      query: { today },
      ...options,
    });
  },

  async getActionItems(
    activeOrgId: string,
    options?: ApiFetchOptions,
  ): Promise<DashboardActionItems> {
    return await api<DashboardActionItems>(`${DASHBOARD_PATH}/action-items`, {
      next: {
        revalidate: 60,
        tags: [`org:${activeOrgId}:dashboard:action-items`],
      },
      ...options,
    });
  },
};
