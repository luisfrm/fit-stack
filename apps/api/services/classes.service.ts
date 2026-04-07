import { classesRepository, type NewCmsClass, type ClassesFilter } from '@/repositories/classes.repository'

export const classesService = {
  async getAll(organizationId: string, filters: ClassesFilter = {}) {
    return classesRepository.findAll(organizationId, filters)
  },

  async getByDate(organizationId: string, date: string) {
    return classesRepository.findByDate(organizationId, date)
  },

  async getById(organizationId: string, id: number) {
    const cls = await classesRepository.findById(organizationId, id)
    if (!cls) throw new Error('Class not found')
    return cls
  },

  async create(organizationId: string, data: Omit<NewCmsClass, 'organizationId'>) {
    if (!data.name || !data.startTime) {
      throw new Error('Name and startTime are required')
    }
    return classesRepository.create(organizationId, data)
  },

  async update(organizationId: string, id: number, data: Partial<Omit<NewCmsClass, 'organizationId'>>) {
    const existing = await classesRepository.findById(organizationId, id)
    if (!existing) throw new Error('Class not found')
    return classesRepository.update(organizationId, id, data)
  },

  async delete(organizationId: string, id: number) {
    const existing = await classesRepository.findById(organizationId, id)
    if (!existing) throw new Error('Class not found')
    return classesRepository.delete(organizationId, id)
  }
}
