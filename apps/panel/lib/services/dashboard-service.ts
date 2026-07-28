import { apiClient } from "../api-client";

export interface DashboardStats {
  activeMembers: number;
  classesToday: number;
  monthlyIncome: Record<string, number>;
  membershipsExpiring: number;
}

export const dashboardService = {
  /**
   * Fetches the 4 key metrics for the dashboard KPI cards.
   * @param today - Current date in YYYY-MM-DD format (matches gym's timezone).
   */
  async getStats(today: string): Promise<DashboardStats> {
    const response = await apiClient.get<DashboardStats>("/dashboard/stats", {
      params: { today },
    });
    return response.data;
  },
};
