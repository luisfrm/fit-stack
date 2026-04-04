import { subscriptionsRepository, type ISubscriptionDTO } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'
import { paymentsRepository } from '../repositories/payments.repository'
import { plansRepository } from '../repositories/plans.repository'
export type { ISubscriptionDTO } from '../repositories/subscriptions.repository'

export interface ICreateSubscriptionPayload extends Omit<ISubscriptionDTO, 'id'> {
  payment: {
    amountPaid: number
    currencyPaid: 'USD' | 'VES' | 'EUR'
    exchangeRateApplied?: string | null
    paymentMethod: 'cash' | 'zelle' | 'pago_movil' | 'pos' | 'other'
    paymentMethodDetails?: string | null
    paymentDate?: string // ISO string
  }
}

export const subscriptionsService = {
  // Obtener todas las suscripciones unidas a la data de Miembro y Plan para la tabla
  async getAllVisible() {
    const gymNow = await settingsService.getGymNow()
    const records = await subscriptionsRepository.findAllVisible(gymNow)

    // Formatear la salida para el frontend (fechas a string ISO y fusionar el nombre completo)
    return records.map(r => ({
      ...r,
      memberName: `${r.memberName} ${r.memberLastName}`,
      roleId: r.roleId,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
    }))
  },

  async getRecent(limit: number) {
    const records = await subscriptionsRepository.findRecent(limit)
    return records.map(r => ({
      id: r.id,
      name: `${r.memberName} ${r.memberLastName}`,
      createdAt: r.createdAt.toISOString(),
    }))
  },

  async create(payload: ICreateSubscriptionPayload) {
    // 1. Obtener datos del plan para el snapshot histórico
    const plan = await plansRepository.findById(payload.planId)
    if (!plan) {
      throw new Error('El plan seleccionado no existe')
    }

    // 2. Crear la suscripción
    const subscription = await subscriptionsRepository.create({
      memberId: payload.memberId,
      planId: payload.planId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status,
    })

    if (!subscription?.id) {
      throw new Error('Error al generar el registro de suscripción')
    }

    // 3. Crear el registro de pago (Snapshot atómico)
    await paymentsRepository.create({
      memberId: payload.memberId,
      subscriptionId: subscription.id,
      planSnapshotName: plan.name,
      planSnapshotPrice: plan.price,
      planSnapshotCurrency: plan.currency,
      amountPaid: payload.payment.amountPaid,
      currencyPaid: payload.payment.currencyPaid,
      exchangeRateApplied: payload.payment.exchangeRateApplied,
      paymentMethod: payload.payment.paymentMethod,
      paymentMethodDetails: payload.payment.paymentMethodDetails,
      paymentDate: payload.payment.paymentDate ? new Date(payload.payment.paymentDate) : new Date(),
    })

    return subscription
  },

  async updateStatus(id: number, status: 'active' | 'cancelled' | 'expired') {
    const updated = await subscriptionsRepository.updateStatus(id, status)
    if (!updated) {
      throw new Error('Suscripción no encontrada')
    }
    return updated
  },

  async delete(id: number): Promise<void> {
    await subscriptionsRepository.delete(id)
  }
}
