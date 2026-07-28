import type { PlatformPlansRepository, NewDbPlatformPlan, PlatformPlansSummary, PlatformPlanWithStats } from '../repositories/platform-plans.repository';

export function createPlatformPlansService(platformPlansRepo: PlatformPlansRepository) {
  return {
    async getAllPlans() {
      return platformPlansRepo.findAll();
    },

    async getAllPlansWithStats(): Promise<PlatformPlanWithStats[]> {
      return platformPlansRepo.findAllWithStats();
    },

    async getSummary(): Promise<PlatformPlansSummary> {
      return platformPlansRepo.getSummary();
    },

    async getPlanById(id: number) {
      const plan = await platformPlansRepo.findById(id);
      if (!plan) {
        throw new Error('Plan de plataforma no encontrado');
      }
      return plan;
    },

    async createPlan(data: NewDbPlatformPlan) {
      if (!data.name) throw new Error('El nombre del plan es requerido');
      if (data.price === undefined || data.price === null) {
        throw new Error('El precio es requerido');
      }

      if (data.features) {
        this.validateFeatures(data.features as any);
      }

      return platformPlansRepo.create(data);
    },

    async updatePlan(id: number, data: Partial<NewDbPlatformPlan>) {
      await this.getPlanById(id);

      if (data.features) {
        this.validateFeatures(data.features as any);
      }

      return platformPlansRepo.update(id, data);
    },

    async deletePlan(id: number) {
      await this.getPlanById(id);
      return platformPlansRepo.delete(id);
    },

    validateFeatures(features: any) {
      if (features.limits && typeof features.limits !== 'object') {
        throw new Error('Límites inválidos');
      }
      if (features.access && typeof features.access !== 'object') {
        throw new Error('Accesos inválidos');
      }
    },
  };
}

export type PlatformPlansService = ReturnType<typeof createPlatformPlansService>;
