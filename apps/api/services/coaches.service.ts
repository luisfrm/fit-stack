import { coachesRepository, CoachesFilter, NewCmsCoach } from '../repositories/coaches.repository';

export const coachesService = {
  async getAllCoaches(filters: CoachesFilter) {
    return coachesRepository.findAll(filters);
  },

  async getCoachById(id: number) {
    const coach = await coachesRepository.findById(id);
    if (!coach) {
      throw new Error('Entrenador no encontrado');
    }
    return coach;
  },

  async createCoach(data: NewCmsCoach) {
    return coachesRepository.create(data);
  },

  async updateCoach(id: number, data: Partial<NewCmsCoach>) {
    await this.getCoachById(id); // Verify existence
    return coachesRepository.update(id, data);
  },

  async deleteCoach(id: number) {
    await this.getCoachById(id); // Verify existence
    await coachesRepository.delete(id);
  }
};
