import type { PaymentsRepository } from '../repositories/payments.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export function createReportsService(paymentsRepo: PaymentsRepository) {
  return {
    async getMonthlyRevenue(organizationId: string, timezone: string = 'America/Caracas', monthsCount: number = 12) {
      const dateManager = new OrganizationDateManager(timezone);
      const startDate = dateManager.getStartOfMonthUtc(monthsCount);

      const rawData = await paymentsRepo.getAggregatedPaymentsMonthly(organizationId, startDate, dateManager);

      return rawData.map((d) => ({
        month: d.month,
        currency: d.currency,
        amount: Number(d.amount),
        normalizedAmount: Number(d.amount),
        originalExchangeRate: d.exchangeRate,
      }));
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
