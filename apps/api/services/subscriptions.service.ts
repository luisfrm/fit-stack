import { subscriptionsRepository, type ISubscriptionDTO } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'
import { paymentsRepository } from '../repositories/payments.repository'
import { plansRepository } from '../repositories/plans.repository'
import { emailService } from './email.service'
import { pdfService } from './pdf/pdf-service'

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
  // Obtener todas las suscripciones unidas a la data de Miembro y Plan para la tabla (paginado)
  async getAllPaginated(organizationId: string, filters: any) {
    const utcNow = new Date()
    const result = await subscriptionsRepository.findAllPaginated({
      ...filters,
      organizationId
    }, utcNow)

    // Formatear la salida para el frontend
    return {
      ...result,
      data: result.data.map((r: any) => ({
        ...r,
        memberName: `${r.memberName} ${r.memberLastName}`,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        paymentDate: r.paymentDate?.toISOString(),
      }))
    }
  },

  // Obtener todas las suscripciones unidas a la data de Miembro y Plan para la tabla
  async getAllVisible(organizationId: string) {
    const utcNow = new Date()
    const records = await subscriptionsRepository.findAllVisible(organizationId, utcNow)

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

  async create(organizationId: string, payload: ICreateSubscriptionPayload, timezone?: string) {
    // 1. Obtener datos del plan para el snapshot histórico
    const plan = await plansRepository.findById(organizationId, payload.planId)
    if (!plan) {
      throw new Error('El plan seleccionado no existe')
    }

    // 2. Blindaje de seguridad: Evitar duplicidad si hay un pago pendiente
    const latest = await subscriptionsRepository.findLatestForMember(organizationId, payload.memberId);
    if (latest?.paymentStatus === 'processing') {
      throw new Error('No es posible registrar un nuevo pago mientras el anterior esté pendiente de validación');
    }

    // 3. Parsear fechas locales usando la zona horaria del gimnasio
    // El frontend ahora envía strings (ej: "2026-04-21") en lugar de ISO strings.
    const startStr = payload.startDate as unknown as string;
    const startDate = typeof startStr === 'string' && !startStr.includes('T') 
      ? await settingsService.parseLocalDate(timezone || 'America/Caracas', startStr)
      : new Date(payload.startDate);
      
    const endStr = payload.endDate as unknown as string;
    const endDate = typeof endStr === 'string' && !endStr.includes('T')
      ? await settingsService.parseLocalDate(timezone || 'America/Caracas', endStr)
      : new Date(payload.endDate);

    // 4. Crear la suscripción
    const subscription = await subscriptionsRepository.create(organizationId, {
      memberId: payload.memberId,
      planId: payload.planId,
      startDate: startDate,
      endDate: endDate,
    })

    if (!subscription?.id) {
      throw new Error('Error al generar el registro de suscripción')
    }

    // 5. Determinar la fecha contable (paymentDate)
    // Si el cajero especificó una fecha manual (retroactiva), la parseamos.
    // Si no, usamos el UTC absoluto actual (new Date).
    let paymentDateFinal: Date;
    if (payload.payment.paymentDate && typeof payload.payment.paymentDate === 'string' && !payload.payment.paymentDate.includes('T')) {
      paymentDateFinal = await settingsService.parseLocalDate(timezone || 'America/Caracas', payload.payment.paymentDate);
    } else {
      paymentDateFinal = new Date();
    }

    // 6. Crear el registro de pago (Snapshot atómico)
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
      paymentDate: paymentDateFinal,
      // Nota: createdAt será manejado automáticamente por la base de datos o el repositorio
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
    if (!paymentData?.member) {
      throw new Error('Pago o miembro no encontrado')
    }

    const details = (paymentData.paymentMethodDetails as any) || {}

    // Normalizar metadatos: manejar tanto formato Array como Objeto legado
    let paymentDetails: Array<{ label: string; value: string }> = []

    if (Array.isArray(details)) {
      paymentDetails = details
        .filter((d: any) => d.type !== 'file') // Excluir archivos/capturas
        .map((d: any) => ({
          label: String(d.label || d.key || ''),
          value: String(d.value || '')
        }))
    } else {
      paymentDetails = Object.entries(details)
        .filter(([_, value]) => {
          // Heurística para excluir archivos en formato legado (rutas o URLs)
          const valStr = String(value);
          return !valStr.startsWith('http') && !valStr.includes('/media/') && !valStr.includes('files/');
        })
        .map(([key, value]) => ({
          label: key.replaceAll('_', ' ').replaceAll(/\b\w/g, l => l.toUpperCase()),
          value: String(value)
        }))
    }

    const formattedData = {
      paymentId: paymentData.id,
      memberName: `${paymentData.member.firstName} ${paymentData.member.lastName}`,
      memberDocumentId: paymentData.member.documentId,
      planName: paymentData.planSnapshotName,
      amountPaidFormatted: `${Number.parseFloat(paymentData.amountPaid.toString()).toLocaleString('es-ES')} ${paymentData.currencyPaid}`,
      paymentMethod: paymentData.paymentMethod.toUpperCase(),
      paymentDate: paymentData.paymentDate,
      paymentDetails // Enviamos la colección completa
    }

    // Generar el archivo PDF profesional usando los datos de la organización ya cargados en paymentData
    const pdfBuffer = await pdfService.generateReceiptBuffer(
      {
        ...formattedData,
        amountPaid: Number(paymentData.amountPaid),
        currencyPaid: paymentData.currencyPaid,
        exchangeRateApplied: paymentData.exchangeRateApplied
      } as any,
      paymentData.organization as any
    )

    return await emailService.sendPaymentReceipt(
      paymentData.member.email,
      formattedData,
      [{
        filename: `Comprobante_${paymentData.id}.pdf`,
        content: pdfBuffer
      }]
    )
  }
}
