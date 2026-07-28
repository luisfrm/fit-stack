import type { TrainersRepository, TrainersFilter, CreateTrainerDTO, UpdateTrainerDTO } from '../repositories/trainers.repository';

export function createTrainersService(trainersRepo: TrainersRepository) {
  return {
    async getAll(organizationId: string, filters: TrainersFilter = {}) {
      return trainersRepo.findAll(organizationId, filters);
    },

    async getById(organizationId: string, id: number) {
      const trainer = await trainersRepo.findById(organizationId, id);
      if (!trainer) {
        throw new Error('Entrenador no encontrado');
      }
      return trainer;
    },

    async create(organizationId: string, data: CreateTrainerDTO) {
      return trainersRepo.create(organizationId, data);
    },

    async update(organizationId: string, id: number, data: UpdateTrainerDTO) {
      const trainer = await trainersRepo.findById(organizationId, id);
      if (!trainer) {
        throw new Error('Entrenador no encontrado');
      }
      return trainersRepo.update(organizationId, id, data);
    },

    async delete(organizationId: string, id: number) {
      const trainer = await trainersRepo.findById(organizationId, id);
      if (!trainer) {
        throw new Error('Entrenador no encontrado');
      }
      await trainersRepo.delete(organizationId, id);
    },
  };
}

export type TrainersService = ReturnType<typeof createTrainersService>;
