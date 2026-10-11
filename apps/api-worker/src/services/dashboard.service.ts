import type { DashboardRepository, DashboardStats } from '../repositories/dashboard.repository';
import type { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { OrganizationDateManager } from '../lib/date-manager';
import type { IDashboardActionItem } from '@workspace/shared';

/** Row returned by repository (expiring / recently expired). */
interface ActionItemRow {
  memberId: number;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  phone: string | null;
  email: string | null;
  planName: string | null;
  endDate: Date;
}

export function createDashboardService(
  dashboardRepo: DashboardRepository,
  subscriptionsRepo?: SubscriptionsRepository
) {
  return {
    async getDashboardSummary(
      organizationId: string,
      timezone: string,
      todayDateStr?: string
    ): Promise<DashboardStats> {
      const dateManager = new OrganizationDateManager(timezone);
      const today = todayDateStr || dateManager.getTodayLocalString();
      const utcNow = new Date();

      return dashboardRepo.getStats(organizationId, today, dateManager, utcNow);
    },

    /**
     * Actionable dashboard lists: expiring soon (≤7 days) and
     * recently expired (past 7 days, unrenewed).
     */
    async getActionItems(
      organizationId: string,
      now: Date = new Date()
    ): Promise<{ expiring: IDashboardActionItem[]; recentlyExpired: IDashboardActionItem[] }> {
      if (!subscriptionsRepo) {
        throw new Error('subscriptionsRepo is required for getActionItems');
      }

      const MS_PER_DAY = 86_400_000;
      // Driver may return MAX(end_date) as string or Date depending on expression type.
      const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));
      const toDays = (endDate: Date): number =>
        Math.floor((endDate.getTime() - now.getTime()) / MS_PER_DAY);
      const toItem = (row: ActionItemRow, kind: IDashboardActionItem['kind']): IDashboardActionItem => {
        const endDate = toDate(row.endDate);
        return {
          kind,
          memberId: row.memberId,
          memberName: `${row.firstName} ${row.lastName}`.trim(),
          imageUrl: row.imageUrl,
          phone: row.phone,
          email: row.email,
          planName: row.planName,
          endDate: endDate.toISOString(),
          // Positive = expires in N days; negative = expired N days ago.
          days: toDays(endDate),
        };
      };

      const [expiringRows, expiredRows] = await Promise.all([
        subscriptionsRepo.getExpiringSoonMembers(organizationId, now) as Promise<ActionItemRow[]>,
        subscriptionsRepo.getRecentlyExpiredMembers(organizationId, now) as Promise<ActionItemRow[]>,
      ]);

      return {
        expiring: expiringRows.map((row) => toItem(row, 'expiring')),
        recentlyExpired: expiredRows.map((row) => toItem(row, 'recently_expired')),
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
