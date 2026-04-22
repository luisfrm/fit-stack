import { paymentsRepository } from '../repositories/payments.repository'
import { subscriptionsRepository } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'

export const financeService = {
  async getDashboardAnalytics(organizationId: string) {
    const now = await settingsService.getGymNow(organizationId)

    // 1. Fetch KPI Data
    const pendingPayments = await paymentsRepository.getPendingPaymentsCount(organizationId)
    const expiringSoon = await subscriptionsRepository.getExpiringSoonCount(organizationId, now)
    const activeSubscriptions = await subscriptionsRepository.getActiveCount(organizationId, now)
    const activeSubscriptionsByPlan = await subscriptionsRepository.getActiveCountByPlan(organizationId, now)

    // Calculate today's revenue in base currency
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    const todayPayments = await paymentsRepository.getAggregatedPayments(organizationId, today)

    // Create breakdown of actual collections today
    const todayRevenueBreakdown = todayPayments.map(p => ({
      currency: p.currency,
      amount: Number(p.amount)
    }))

    // 2. Fetch Chart Data (last 30 days)
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)

    const chartDataRaw = await paymentsRepository.getAggregatedPayments(organizationId, startDate)

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
    const futureDate = new Date(now)
    futureDate.setDate(futureDate.getDate() + 30)
    const renewals = await subscriptionsRepository.getRenewalsProjection(organizationId, now, futureDate)
    
    // Net Growth (last 30 days)
    const growth = await subscriptionsRepository.getNetGrowth(organizationId, startDate, now)

    // The frontend will handle the specific grouping for the chart window
    // but we return the raw aggregated records for efficiency.

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
        normalizedAmount: Number(d.amount), // Will be accurately converted in the frontend layer
        originalExchangeRate: d.exchangeRate
      }))
    }
  }
}
