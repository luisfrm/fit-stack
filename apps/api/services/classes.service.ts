import { classesRepository, type NewCmsClass, type ClassesFilter } from '@/repositories/classes.repository'

export const classesService = {
  async getAll(filters: ClassesFilter = {}) {
    return classesRepository.findAll(filters)
  },

  async getByDate(date: string) {
    return classesRepository.findByDate(date)
  },

  async getById(id: number) {
    const cls = await classesRepository.findById(id)
    if (!cls) throw new Error('Class not found')
    return cls
  },

  async create(data: NewCmsClass) {
    if (!data.name || !data.startTime) {
      throw new Error('Name and startTime are required')
    }
    return classesRepository.create(data)
  },

  async update(id: number, data: Partial<NewCmsClass>) {
    const existing = await classesRepository.findById(id)
    if (!existing) throw new Error('Class not found')
    return classesRepository.update(id, data)
  },

  async delete(id: number) {
    const existing = await classesRepository.findById(id)
    if (!existing) throw new Error('Class not found')
    return classesRepository.delete(id)
  }
}
