import { paymentsRepository } from '../repositories/payments.repository'
import { subscriptionsRepository } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'

export const financeService = {
  async getDashboardAnalytics(organizationId: string) {
    const dateManager = await settingsService.getDateManager(organizationId)
    const utcNow = new Date()

    // 1. Fetch KPI Data
    const pendingPayments = await paymentsRepository.getPendingPaymentsCount(organizationId)
    const expiringSoon = await subscriptionsRepository.getExpiringSoonCount(organizationId, utcNow)
    const activeSubscriptions = await subscriptionsRepository.getActiveCount(organizationId, utcNow)
    const activeSubscriptionsByPlan = await subscriptionsRepository.getActiveCountByPlan(organizationId, utcNow)

    // Calculate today's revenue in base currency (Local day)
    const localTodayStart = dateManager.getStartOfDayUtc()

    const todayPayments = await paymentsRepository.getAggregatedPayments(organizationId, localTodayStart, dateManager)

    // Create breakdown of actual collections today
    const todayRevenueBreakdown = todayPayments.map(p => ({
      currency: p.currency,
      amount: Number(p.amount)
    }))

    // 2. Fetch Chart Data (last 30 days)
    const startDate = new Date(localTodayStart)
    startDate.setUTCDate(startDate.getUTCDate() - 30)

    const chartDataRaw = await paymentsRepository.getAggregatedPayments(organizationId, startDate, dateManager)

    // Payment Methods
    const paymentMethodsRaw = await paymentsRepository.getPaymentsByMethod(organizationId, startDate)
    
    const methodsMap: Record<string, { method: string, count: number, breakdown: Record<string, number> }> = {}
    
    for (const record of paymentMethodsRaw) {
      const methodKey = record.paymentMethod || 'unknown';
      if (!methodsMap[methodKey]) {
        methodsMap[methodKey] = {
          method: methodKey,
          count: 0,
          breakdown: {}
        }
      }
      methodsMap[methodKey].count += record.count
      methodsMap[methodKey].breakdown[record.currencyPaid] = (methodsMap[methodKey].breakdown[record.currencyPaid] || 0) + Number(record.totalAmount)
    }
    
    const paymentMethods = Object.values(methodsMap)

    // Renewals (next 30 days)
    const futureDate = new Date(localTodayStart)
    futureDate.setUTCDate(futureDate.getUTCDate() + 30)
    const renewals = await subscriptionsRepository.getRenewalsProjection(organizationId, localTodayStart, futureDate, dateManager)
    
    // Net Growth (last 30 days)
    const growth = await subscriptionsRepository.getNetGrowth(organizationId, startDate, utcNow, dateManager)

    return {
      kpis: {
        todayRevenue: todayRevenueBreakdown,
        pendingPayments,
        expiringSoon,
        activeSubscriptions
      },
      plansDistribution: activeSubscriptionsByPlan,
      paymentMethods,
      renewals,
      growth,
      chartData: chartDataRaw.map(d => ({
        day: d.day,
        currency: d.currency,
        amount: Number(d.amount),
        normalizedAmount: Number(d.amount), 
        originalExchangeRate: d.exchangeRate
      }))
    }
  }
}
