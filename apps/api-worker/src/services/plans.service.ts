import type { PlansRepository, IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export type { IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository';

export function createPlansService(plansRepo: PlansRepository) {
  return {
    async getAll(organizationId: string, filters: { includeStats?: boolean } = {}): Promise<IMembershipPlan[]> {
      return plansRepo.findAll(organizationId, filters);
    },

    async getSummary(organizationId: string, timezone: string = 'America/Caracas'): Promise<IMembershipsSummary> {
      const dateManager = new OrganizationDateManager(timezone);
      const utcNow = new Date();
      return plansRepo.getSummary(organizationId, dateManager, utcNow);
    },

    async getById(organizationId: string, id: number): Promise<IMembershipPlan> {
      const plan = await plansRepo.findById(organizationId, id);
      if (!plan) {
        throw new Error('Plan no encontrado');
      }
      return plan;
    },

    async findById(organizationId: string, id: number): Promise<IMembershipPlan | undefined> {
      return plansRepo.findById(organizationId, id);
    },

    async create(organizationId: string, data: Omit<IMembershipPlan, 'id' | 'organizationId'>): Promise<IMembershipPlan> {
      const newPlan = await plansRepo.create(organizationId, data);
      if (!newPlan) {
        throw new Error('Error al crear el plan');
      }
      return newPlan;
    },

    async update(organizationId: string, id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
      const plan = await plansRepo.findById(organizationId, id);
      if (!plan) {
        throw new Error('Plan no encontrado');
      }
      return plansRepo.update(organizationId, id, data);
    },

    async delete(organizationId: string, id: number): Promise<void> {
      const plan = await plansRepo.findById(organizationId, id);
      if (!plan) {
        throw new Error('Plan no encontrado');
      }
      await plansRepo.delete(organizationId, id);
    },
  };
}

export type PlansService = ReturnType<typeof createPlansService>;
