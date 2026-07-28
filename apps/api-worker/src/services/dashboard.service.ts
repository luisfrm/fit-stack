import type { DashboardRepository, DashboardStats } from '../repositories/dashboard.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export function createDashboardService(dashboardRepo: DashboardRepository) {
  return {
    async getDashboardSummary(
      organizationId: string,
      timezone: string = 'America/Caracas',
      todayDateStr?: string
    ): Promise<DashboardStats> {
      const dateManager = new OrganizationDateManager(timezone);
      const today = todayDateStr || dateManager.getTodayLocalString();
      const utcNow = new Date();

      return dashboardRepo.getStats(organizationId, today, dateManager, utcNow);
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
