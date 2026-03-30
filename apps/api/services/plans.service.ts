import { plansRepository, type IMembershipPlan } from '../repositories/plans.repository'
export type { IMembershipPlan }

export const plansService = {
  async getAll(): Promise<IMembershipPlan[]> {
    return plansRepository.findAll()
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
