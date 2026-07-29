import type { ContentPagesRepository, IContentPage } from '../repositories/content-pages.repository';

export function createContentPagesService(pagesRepo: ContentPagesRepository) {
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

    async createPage(organizationId: string, data: Omit<IContentPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const existing = await pagesRepo.findBySlug(organizationId, data.slug);
      if (existing) throw new Error('El slug ya está en uso en esta organización');

      return pagesRepo.create(organizationId, data);
    },

    async updatePage(organizationId: string, id: number, data: Partial<IContentPage>) {
      return pagesRepo.update(organizationId, id, data);
    },

    async deletePage(organizationId: string, id: number) {
      return pagesRepo.delete(organizationId, id);
    },
  };
}

export type ContentPagesService = ReturnType<typeof createContentPagesService>;
