import { plansRepository, IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository'
import { settingsService } from './settings.service'
export type { IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository'

export const plansService = {
  async getAll(filters: { includeStats?: boolean } = {}): Promise<IMembershipPlan[]> {
    const gymNow = await settingsService.getGymNow()
    return plansRepository.findAll(filters, gymNow)
  },

  async getSummary(): Promise<IMembershipsSummary> {
    const gymNow = await settingsService.getGymNow()
    return plansRepository.getSummary(gymNow)
  },

  async getById(id: number): Promise<IMembershipPlan | undefined> {
    const plan = await plansRepository.findById(id)
    if (!plan) {
      throw new Error('Plan no encontrado');
    }
    return plan
  },

  async create(data: Omit<IMembershipPlan, 'id'>): Promise<IMembershipPlan> {
    const newPlan = await plansRepository.create(data)
    if (!newPlan) {
      throw new Error('Error al crear el plan');
    }
    return newPlan
  },

  async update(id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
    await this.getById(id)
    return plansRepository.update(id, data)
  },

  async delete(id: number): Promise<void> {
    await this.getById(id)
    await plansRepository.delete(id)
  }
}
