import { subscriptionsRepository, type ISubscriptionDTO } from '../repositories/subscriptions.repository'
export type { ISubscriptionDTO } from '../repositories/subscriptions.repository'

export const subscriptionsService = {
  // Obtener todas las suscripciones unidas a la data de Miembro y Plan para la tabla
  async getAllVisible() {
    const records = await subscriptionsRepository.findAllVisible()

    // Formatear la salida para el frontend (fechas a string ISO y fusionar el nombre completo)
    return records.map(r => ({
      ...r,
      memberName: `${r.memberName} ${r.memberLastName}`,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
    }))
  },

  async create(data: Omit<ISubscriptionDTO, 'id'>) {
    const inserted = await subscriptionsRepository.create(data)
    if (!inserted) {
      throw new Error('Error al crear la suscripción')
    }
    return inserted
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
