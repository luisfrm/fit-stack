import type { PaymentsRepository } from '../repositories/payments.repository';
import type { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export function createFinanceService(
  paymentsRepo: PaymentsRepository,
  subsRepo: SubscriptionsRepository
) {
  return {
    async getDashboardAnalytics(organizationId: string, timezone: string = 'America/Caracas') {
      const dateManager = new OrganizationDateManager(timezone);
      const utcNow = new Date();

      // 1. Fetch KPI Data
      const pendingPayments = await paymentsRepo.getPendingPaymentsCount(organizationId);
      const expiringSoon = await subsRepo.getExpiringSoonCount(organizationId, utcNow);
      const activeSubscriptions = await subsRepo.getActiveCount(organizationId, utcNow);
      const activeSubscriptionsByPlan = await subsRepo.getActiveCountByPlan(organizationId, utcNow);

      // Calculate today's revenue (Local day)
      const localTodayStart = dateManager.getStartOfDayUtc();
      const todayPayments = await paymentsRepo.getAggregatedPayments(organizationId, localTodayStart, dateManager);

      const todayRevenueBreakdown = todayPayments.map((p) => ({
        currency: p.currency,
        amount: Number(p.amount),
      }));

      // 2. Fetch Chart Data (last 30 days)
      const startDate = new Date(localTodayStart);
      startDate.setUTCDate(startDate.getUTCDate() - 30);

      const chartDataRaw = await paymentsRepo.getAggregatedPayments(organizationId, startDate, dateManager);

      // Payment Methods breakdown
      const paymentMethodsRaw = await paymentsRepo.getPaymentsByMethod(organizationId, startDate);
      const methodsMap: Record<string, { method: string; count: number; breakdown: Record<string, number> }> = {};

      for (const record of paymentMethodsRaw) {
        const methodKey = record.paymentMethod || 'unknown';
        if (!methodsMap[methodKey]) {
          methodsMap[methodKey] = {
            method: methodKey,
            count: 0,
            breakdown: {},
          };
        }
        methodsMap[methodKey].count += record.count;
        methodsMap[methodKey].breakdown[record.currencyPaid] =
          (methodsMap[methodKey].breakdown[record.currencyPaid] || 0) + Number(record.totalAmount);
      }

      const paymentMethods = Object.values(methodsMap);

      // Renewals (next 30 days)
      const futureDate = new Date(localTodayStart);
      futureDate.setUTCDate(futureDate.getUTCDate() + 30);
      const renewals = await subsRepo.getRenewalsProjection(organizationId, localTodayStart, futureDate, dateManager);

      // Net Growth (last 30 days)
      const growth = await subsRepo.getNetGrowth(organizationId, startDate, utcNow, dateManager);

      return {
        kpis: {
          todayRevenue: todayRevenueBreakdown,
          pendingPayments,
          expiringSoon,
          activeSubscriptions,
        },
        plansDistribution: activeSubscriptionsByPlan,
        paymentMethods,
        renewals,
        growth,
        chartData: chartDataRaw.map((d) => ({
          day: d.day,
          currency: d.currency,
          amount: Number(d.amount),
          normalizedAmount: Number(d.amount),
          originalExchangeRate: d.exchangeRate ?? '1',
        })),
      };
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
