import { paymentsRepository } from '../repositories/payments.repository'
import { subscriptionsRepository } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'

export const financeService = {
  async getDashboardAnalytics(organizationId: string) {
    const timezone = (await settingsService.getByKey(organizationId, 'timezone')) || 'America/Caracas'
    const gymNow = await settingsService.getGymNow(organizationId)
    const utcNow = new Date()

    // 1. Fetch KPI Data
    const pendingPayments = await paymentsRepository.getPendingPaymentsCount(organizationId)
    const expiringSoon = await subscriptionsRepository.getExpiringSoonCount(organizationId, utcNow)
    const activeSubscriptions = await subscriptionsRepository.getActiveCount(organizationId, utcNow)
    const activeSubscriptionsByPlan = await subscriptionsRepository.getActiveCountByPlan(organizationId, utcNow)

    // Calculate today's revenue in base currency (Local day)
    // To get "Today" in local time, we use the gymNow (which is already shifted to local)
    // but we need to be careful with how we query the DB.
    const localTodayStart = new Date(gymNow)
    localTodayStart.setHours(0, 0, 0, 0)
    
    // Convert localTodayStart (which is shifted) back to actual UTC for the DB query?
    // Actually, it's easier to use the timezone in the repository.

    const todayPayments = await paymentsRepository.getAggregatedPayments(organizationId, localTodayStart, timezone)

    // Create breakdown of actual collections today
    const todayRevenueBreakdown = todayPayments.map(p => ({
      currency: p.currency,
      amount: Number(p.amount)
    }))

    // 2. Fetch Chart Data (last 30 days)
    const startDate = new Date(gymNow)
    startDate.setDate(startDate.getDate() - 30)
    startDate.setHours(0, 0, 0, 0)

    const chartDataRaw = await paymentsRepository.getAggregatedPayments(organizationId, startDate, timezone)

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
    const futureDate = new Date(gymNow)
    futureDate.setDate(futureDate.getDate() + 30)
    const renewals = await subscriptionsRepository.getRenewalsProjection(organizationId, gymNow, futureDate, timezone)
    
    // Net Growth (last 30 days)
    const growth = await subscriptionsRepository.getNetGrowth(organizationId, startDate, utcNow, timezone)

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
