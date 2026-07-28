import { api, type ApiFetchOptions } from "@/lib/api/client";

export interface DashboardStats {
  activeMembers: number;
  classesToday: number;
  monthlyIncome: Record<string, number>;
  membershipsExpiring: number;
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
};
