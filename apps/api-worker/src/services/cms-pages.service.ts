import type { CmsPagesRepository, ICmsPage } from '../repositories/cms-pages.repository';

export function createCmsPagesService(pagesRepo: CmsPagesRepository) {
  return {
    async getAllPages(organizationId: string) {
      return pagesRepo.findAll(organizationId);
    },

    async getPageById(organizationId: string, id: number) {
      const page = await pagesRepo.findById(organizationId, id);
      if (!page) throw new Error('Página no encontrada');
      return page;
    },

    async getPageBySlug(organizationId: string, slug: string) {
      const page = await pagesRepo.findBySlug(organizationId, slug);
      if (!page) throw new Error('Página no encontrada');
      return page;
    },

    async createPage(organizationId: string, data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const existing = await pagesRepo.findBySlug(organizationId, data.slug);
      if (existing) throw new Error('El slug ya está en uso en esta organización');

      return pagesRepo.create(organizationId, data);
    },

    async updatePage(organizationId: string, id: number, data: Partial<ICmsPage>) {
      return pagesRepo.update(organizationId, id, data);
    },

    async deletePage(organizationId: string, id: number) {
      return pagesRepo.delete(organizationId, id);
    },
  };
}

export type CmsPagesService = ReturnType<typeof createCmsPagesService>;
