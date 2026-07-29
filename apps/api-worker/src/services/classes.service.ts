import type { ClassesRepository, ClassesFilter, PaginatedClasses, NewGymClass } from '../repositories/classes.repository';

export function createClassesService(classesRepo: ClassesRepository) {
  return {
    async getAll(organizationId: string, filters: ClassesFilter = {}): Promise<PaginatedClasses> {
      return classesRepo.findAll(organizationId, filters);
    },

    async getByDate(organizationId: string, date: string) {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('La fecha debe tener el formato YYYY-MM-DD');
      }
      return classesRepo.findByDate(organizationId, date);
    },

    async getById(organizationId: string, id: number) {
      const classItem = await classesRepo.findById(organizationId, id);
      if (!classItem) {
        throw new Error('Clase no encontrada');
      }
      return classItem;
    },

    async create(organizationId: string, data: Omit<NewGymClass, 'organizationId'>) {
      return classesRepo.create(organizationId, data);
    },

    async update(organizationId: string, id: number, data: Partial<Omit<NewGymClass, 'organizationId'>>) {
      const classItem = await classesRepo.findById(organizationId, id);
      if (!classItem) {
        throw new Error('Clase no encontrada');
      }
      return classesRepo.update(organizationId, id, data);
    },

    async delete(organizationId: string, id: number) {
      const classItem = await classesRepo.findById(organizationId, id);
      if (!classItem) {
        throw new Error('Clase no encontrada');
      }
      await classesRepo.delete(organizationId, id);
    },
  };
}

export type ClassesService = ReturnType<typeof createClassesService>;
