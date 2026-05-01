import { plansRepository, IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository'
import { settingsService } from './settings.service'
export type { IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository'

export const plansService = {
  async getAll(organizationId: string, filters: { includeStats?: boolean } = {}): Promise<IMembershipPlan[]> {
    return plansRepository.findAll(organizationId, filters)
  },

  async getSummary(organizationId: string): Promise<IMembershipsSummary> {
    const dateManager = await settingsService.getDateManager(organizationId)
    const utcNow = new Date()
    return plansRepository.getSummary(organizationId, dateManager, utcNow)
  },

  async getById(organizationId: string, id: number): Promise<IMembershipPlan | undefined> {
    const plan = await plansRepository.findById(organizationId, id)
    if (!plan) {
      throw new Error('Plan no encontrado');
    }
    return plan
  },

  async create(organizationId: string, data: Omit<IMembershipPlan, 'id' | 'organizationId'>): Promise<IMembershipPlan> {
    const newPlan = await plansRepository.create(organizationId, data)
    if (!newPlan) {
      throw new Error('Error al crear el plan');
    }
    return newPlan
  },

  async update(organizationId: string, id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
    await this.getById(organizationId, id)
    return plansRepository.update(organizationId, id, data)
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await this.getById(organizationId, id)
    await plansRepository.delete(organizationId, id)
  }
}
