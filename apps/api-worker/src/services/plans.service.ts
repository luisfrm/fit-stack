import type { PlansRepository, IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export type { IMembershipPlan, IMembershipsSummary } from '../repositories/plans.repository';

export function createPlansService(plansRepo: PlansRepository) {
  return {
    async getAll(organizationId: string, filters: { includeStats?: boolean } = {}): Promise<IMembershipPlan[]> {
      return plansRepo.findAll(organizationId, filters);
    },

    async getSummary(organizationId: string, timezone: string): Promise<IMembershipsSummary> {
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

    /**
     * Soft delete. A plan with subscriptions must never be hard-deleted
     * (financial record is immutable); the row is flagged and hidden, and
     * historical JOINs (planName) keep resolving. No interactive transactions
     * (Neon HTTP): the row is flagged in a single statement and the outcome
     * is confirmed by re-read. Returns `null` when the plan does not exist
     * (route maps to 404); re-deleting an already-deleted plan is a no-op
     * success (idempotent).
     */
    async deletePlan(organizationId: string, id: number): Promise<IMembershipPlan | null> {
      const plan = await plansRepo.findById(organizationId, id, { includeDeleted: true });
      if (!plan) return null;
      if (plan.deletedAt) return plan;
      await plansRepo.softDelete(organizationId, id);
      // Fail-closed: confirm by re-read, never assume the UPDATE landed.
      const reRead = await plansRepo.findById(organizationId, id, { includeDeleted: true });
      if (!reRead?.deletedAt) {
        throw new Error('No se pudo eliminar el plan');
      }
      return reRead;
    },
  };
}

export type PlansService = ReturnType<typeof createPlansService>;
