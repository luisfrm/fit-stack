import { paymentsRepository } from '../repositories/payments.repository'
import { settingsService } from './settings.service'

export const reportsService = {
  async getMonthlyRevenue(organizationId: string, monthsCount: number = 12) {
    const now = await settingsService.getGymNow(organizationId)

    // Start date is exactly N months ago
    const startDate = new Date(now)
    startDate.setMonth(startDate.getMonth() - monthsCount)
    startDate.setDate(1) // Start of the month
    startDate.setHours(0, 0, 0, 0)

    const rawData = await paymentsRepository.getAggregatedPaymentsMonthly(organizationId, startDate)

    return rawData.map(d => ({
      month: d.month,
      currency: d.currency,
      amount: Number(d.amount),
      normalizedAmount: Number(d.amount), // Frontend will normalize this
      originalExchangeRate: d.exchangeRate
    }))
  }
}
