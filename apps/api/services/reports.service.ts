import { paymentsRepository } from '../repositories/payments.repository'
import { settingsService } from './settings.service'

export const reportsService = {
  async getMonthlyRevenue(organizationId: string, timezone?: string, monthsCount: number = 12) {
    const dateManager = settingsService.getDateManager(timezone)
    const startDate = dateManager.getStartOfMonthUtc(monthsCount)

    const rawData = await paymentsRepository.getAggregatedPaymentsMonthly(organizationId, startDate, dateManager)

    return rawData.map(d => ({
      month: d.month,
      currency: d.currency,
      amount: Number(d.amount),
      normalizedAmount: Number(d.amount), // Frontend will normalize this
      originalExchangeRate: d.exchangeRate
    }))
  }
}
