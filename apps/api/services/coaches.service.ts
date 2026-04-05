import { coachesRepository, CoachesFilter, CreateCoachDTO, UpdateCoachDTO } from '../repositories/coaches.repository';

export const coachesService = {
  async getAllCoaches(organizationId: string, filters: CoachesFilter) {
    return coachesRepository.findAll(organizationId, filters);
  },

  async getCoachById(organizationId: string, id: number) {
    const coach = await coachesRepository.findById(organizationId, id);
    if (!coach) {
      throw new Error('Entrenador no encontrado');
    }
    return coach;
  },

  async createCoach(organizationId: string, data: CreateCoachDTO) {
    return coachesRepository.create(organizationId, data);
  },

  async updateCoach(organizationId: string, id: number, data: UpdateCoachDTO) {
    await this.getCoachById(organizationId, id); // Verify existence
    return coachesRepository.update(organizationId, id, data);
  },

  async deleteCoach(organizationId: string, id: number) {
    await this.getCoachById(organizationId, id); // Verify existence
    await coachesRepository.delete(organizationId, id);
  }
};
