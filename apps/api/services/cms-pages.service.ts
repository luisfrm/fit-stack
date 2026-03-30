import { cmsPagesRepository, ICmsPage } from '../repositories/cms-pages.repository'

export const cmsPagesService = {
  async getAllPages() {
    return await cmsPagesRepository.findAll()
  },

  async getPageById(id: number) {
    const page = await cmsPagesRepository.findById(id)
    if (!page) throw new Error('Página no encontrada')
    return page
  },

  async getPageBySlug(slug: string) {
    const page = await cmsPagesRepository.findBySlug(slug)
    if (!page) throw new Error('Página no encontrada')
    return page
  },

  async createPage(data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt'>) {
    // Validar slug único (el repo ya tiene unique constraint, pero manejamos el error)
    const existing = await cmsPagesRepository.findBySlug(data.slug)
    if (existing) throw new Error('El slug ya está en uso')
    
    return await cmsPagesRepository.create(data)
  },

  async updatePage(id: number, data: Partial<ICmsPage>) {
    return await cmsPagesRepository.update(id, data)
  },

  async deletePage(id: number) {
    return await cmsPagesRepository.delete(id)
  }
}
