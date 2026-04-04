import { dashboardRepository, DashboardStats } from '../repositories/dashboard.repository';
import { settingsService } from './settings.service';

export const dashboardService = {
  async getDashboardStats(today: string): Promise<DashboardStats> {
    const gymNow = await settingsService.getGymNow();
    return dashboardRepository.getStats(today, gymNow);
  }
};
