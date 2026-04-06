import { NewDbPlatformPlan, platformPlansRepository } from '../repositories/platform-plans.repository';

export const platformPlansService = {
  async getAllPlans() {
    return platformPlansRepository.findAll();
  },

  async getPlanById(id: number) {
    const plan = await platformPlansRepository.findById(id);
    if (!plan) {
      throw new Error('Plan de plataforma no encontrado');
    }
    return plan;
  },

  async createPlan(data: NewDbPlatformPlan) {
    if (!data.name) throw new Error('El nombre del plan es requerido');
    if (data.monthlyPrice === undefined || data.monthlyPrice === null) {
      throw new Error('El precio mensual es requerido');
    }

    // Validar estructura de features si existe
    if (data.features) {
      this.validateFeatures(data.features as any);
    }

    return platformPlansRepository.create(data);
  },

  async updatePlan(id: number, data: Partial<NewDbPlatformPlan>) {
    await this.getPlanById(id);

    if (data.features) {
      this.validateFeatures(data.features as any);
    }

    return platformPlansRepository.update(id, data);
  },

  async deletePlan(id: number) {
    await this.getPlanById(id);
    return platformPlansRepository.delete(id);
  },

  validateFeatures(features: any) {
    // Validación básica de la interfaz PlanFeatures (shared/src/types.ts)
    if (features.limits) {
      if (typeof features.limits !== 'object') throw new Error('Límites inválidos');
    }
    if (features.access) {
      if (typeof features.access !== 'object') throw new Error('Accesos inválidos');
    }
  }
};
