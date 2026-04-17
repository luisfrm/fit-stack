import { subscriptionsRepository, type ISubscriptionDTO } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'
import { paymentsRepository } from '../repositories/payments.repository'
import { plansRepository } from '../repositories/plans.repository'
import { emailService } from './email.service'
export type { ISubscriptionDTO } from '../repositories/subscriptions.repository'

export interface ICreateSubscriptionPayload extends Omit<ISubscriptionDTO, 'id' | 'organizationId'> {
  payment: {
    amountPaid: number
    currencyPaid: string
    exchangeRateApplied?: string | null
    paymentMethod: string
    paymentMethodDetails?: Record<string, any> | null
    status?: string
    paymentDate?: string | Date
  }
}

export const subscriptionsService = {
  // Obtener todas las suscripciones unidas a la data de Miembro y Plan para la tabla
  async getAllVisible(organizationId: string) {
    const gymNow = await settingsService.getGymNow(organizationId)
    const records = await subscriptionsRepository.findAllVisible(organizationId, gymNow)

    // Formatear la salida para el frontend (fechas a string ISO y fusionar el nombre completo)
    return records.map((r: any) => ({
      ...r,
      memberName: `${r.memberName} ${r.memberLastName}`,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      paymentDate: r.paymentDate?.toISOString(),
    }))
  },

  async getRecent(organizationId: string, limit: number) {
    const records = await subscriptionsRepository.findRecent(organizationId, limit)
    return records.map((r: any) => ({
      id: r.id,
      name: `${r.memberName} ${r.memberLastName}`,
      createdAt: r.createdAt.toISOString(),
    }))
  },

  async create(organizationId: string, payload: ICreateSubscriptionPayload) {
    // 1. Obtener datos del plan para el snapshot histórico
    const plan = await plansRepository.findById(organizationId, payload.planId)
    if (!plan) {
      throw new Error('El plan seleccionado no existe')
    }

    // 2. Crear la suscripción
    const subscription = await subscriptionsRepository.create(organizationId, {
      memberId: payload.memberId,
      planId: payload.planId,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
    })

    if (!subscription?.id) {
      throw new Error('Error al generar el registro de suscripción')
    }

    // 3. Crear el registro de pago (Snapshot atómico)
    await paymentsRepository.create(organizationId, {
      memberId: payload.memberId,
      subscriptionId: subscription.id,
      planSnapshotName: plan.name,
      planSnapshotPrice: plan.price.toString(),
      planSnapshotCurrency: plan.currency,
      amountPaid: payload.payment.amountPaid,
      currencyPaid: payload.payment.currencyPaid,
      exchangeRateApplied: payload.payment.exchangeRateApplied,
      paymentMethod: payload.payment.paymentMethod,
      paymentMethodDetails: payload.payment.paymentMethodDetails,
      status: payload.payment.status as any,
      paymentDate: payload.payment.paymentDate ? new Date(payload.payment.paymentDate) : new Date(),
    })

    return subscription
  },

  async updatePaymentStatus(organizationId: string, paymentId: number, status: 'processing' | 'validated' | 'invalid' | 'voided') {
    const updated = await paymentsRepository.updateStatus(organizationId, paymentId, status)
    if (!updated) {
      throw new Error('Registro de pago no encontrado')
    }
    return updated
  },

  async cancel(organizationId: string, id: number) {
    const updated = await subscriptionsRepository.cancel(organizationId, id)
    if (!updated) {
      throw new Error('Suscripción no encontrada')
    }
    return updated
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await subscriptionsRepository.delete(organizationId, id)
  },

  async sendReceiptEmail(organizationId: string, paymentId: number) {
    const paymentData = await paymentsRepository.findByIdDetailed(organizationId, paymentId)
    if (!paymentData || !paymentData.member) {
      throw new Error('Pago o miembro no encontrado')
    }

    const formattedData = {
      paymentId: paymentData.id,
      memberName: `${paymentData.member.firstName} ${paymentData.member.lastName}`,
      planName: paymentData.planSnapshotName,
      amountPaidFormatted: `${Number.parseFloat(paymentData.amountPaid.toString()).toLocaleString('es-ES')} ${paymentData.currencyPaid}`,
      paymentMethod: paymentData.paymentMethod.toUpperCase(),
      paymentDate: paymentData.paymentDate,
      reference: paymentData.paymentMethodDetails?.reference || paymentData.paymentMethodDetails?.confirmation_number || ''
    }

    return await emailService.sendPaymentReceipt(paymentData.member.email, formattedData)
  }
}
