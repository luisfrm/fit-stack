import type { PlatformPlansRepository, NewDbPlatformPlan, PlatformPlansSummary, PlatformPlanWithStats } from '../repositories/platform-plans.repository';
import { normalizeFeatures, type PlanFeaturesV2 } from '@workspace/shared';

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

      const normalized = {
        ...data,
        features: this.normalizeFeatures(data.features as PlanFeaturesV2 | null | undefined),
      };

      return platformPlansRepo.create(normalized);
    },

    async updatePlan(id: number, data: Partial<NewDbPlatformPlan>) {
      await this.getPlanById(id);

      const normalized = {
        ...data,
        features:
          data.features !== undefined
            ? this.normalizeFeatures(data.features as PlanFeaturesV2 | null | undefined)
            : undefined,
      };

      return platformPlansRepo.update(id, normalized);
    },

    async deletePlan(id: number) {
      await this.getPlanById(id);
      return platformPlansRepo.delete(id);
    },

    /**
     * Normaliza features contra el catálogo: descarta IDs desconocidos,
     * aplica defaults y garantiza `panel` siempre habilitado.
     */
    normalizeFeatures(features: PlanFeaturesV2 | null | undefined) {
      return normalizeFeatures(features ?? {});
    },
  };
}

export type PlatformPlansService = ReturnType<typeof createPlatformPlansService>;
