import { cmsPagesRepository, ICmsPage } from '../repositories/cms-pages.repository'

export const cmsPagesService = {
  async getAllPages(organizationId: string) {
    return await cmsPagesRepository.findAll(organizationId)
  },

  async getPageById(organizationId: string, id: number) {
    const page = await cmsPagesRepository.findById(organizationId, id)
    if (!page) throw new Error('Página no encontrada')
    return page
  },

  async getPageBySlug(organizationId: string, slug: string) {
    const page = await cmsPagesRepository.findBySlug(organizationId, slug)
    if (!page) throw new Error('Página no encontrada')
    return page
  },

  async createPage(organizationId: string, data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
    const existing = await cmsPagesRepository.findBySlug(organizationId, data.slug)
    if (existing) throw new Error('El slug ya está en uso en esta organización')
    
    return await cmsPagesRepository.create(organizationId, data)
  },

  async updatePage(organizationId: string, id: number, data: Partial<ICmsPage>) {
    return await cmsPagesRepository.update(organizationId, id, data)
  },

  async deletePage(organizationId: string, id: number) {
    return await cmsPagesRepository.delete(organizationId, id)
  }
}
