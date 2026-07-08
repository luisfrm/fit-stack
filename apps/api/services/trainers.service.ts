import { trainersRepository, TrainersFilter, CreateTrainerDTO, UpdateTrainerDTO } from '../repositories/trainers.repository';

export const trainersService = {
  async getAllTrainers(organizationId: string, filters: TrainersFilter) {
    return trainersRepository.findAll(organizationId, filters);
  },

  async getTrainerById(organizationId: string, id: number) {
    const trainer = await trainersRepository.findById(organizationId, id);
    if (!trainer) {
      throw new Error('Entrenador no encontrado');
    }
    return trainer;
  },

  async createTrainer(organizationId: string, data: CreateTrainerDTO) {
    return trainersRepository.create(organizationId, data);
  },

  async updateTrainer(organizationId: string, id: number, data: UpdateTrainerDTO) {
    await this.getTrainerById(organizationId, id);
    return trainersRepository.update(organizationId, id, data);
  },

  async deleteTrainer(organizationId: string, id: number) {
    await this.getTrainerById(organizationId, id);
    await trainersRepository.delete(organizationId, id);
  }
};