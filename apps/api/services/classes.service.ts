import { classesRepository, type NewCmsClass } from '@/repositories/classes.repository'

export const classesService = {
  async getAll() {
    return classesRepository.findAll()
  },

  async getById(id: number) {
    const cls = await classesRepository.findById(id)
    if (!cls) throw new Error('Class not found')
    return cls
  },

  async create(data: NewCmsClass) {
    if (!data.name || !data.timeInfo) {
      throw new Error('Name and timeInfo are required')
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
