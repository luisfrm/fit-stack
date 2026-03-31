import { dashboardRepository, DashboardStats } from '../repositories/dashboard.repository';

export const dashboardService = {
  async getDashboardStats(today: string): Promise<DashboardStats> {
    return dashboardRepository.getStats(today);
  }
};
