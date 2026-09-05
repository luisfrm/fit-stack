import type { ContentPagesRepository, IContentPage } from '../repositories/content-pages.repository';
import { HTTPException } from 'hono/http-exception';

export function createContentPagesService(pagesRepo: ContentPagesRepository) {
  return {
    async getAllPages(organizationId: string) {
      return pagesRepo.findAll(organizationId);
    },

    async getPageById(organizationId: string, id: number) {
      const page = await pagesRepo.findById(organizationId, id);
      if (!page) throw new HTTPException(404, { message: 'Página no encontrada' });
      return page;
    },

    async getPageBySlug(organizationId: string, slug: string) {
      const page = await pagesRepo.findBySlug(organizationId, slug);
      if (!page) throw new HTTPException(404, { message: 'Página no encontrada' });
      return page;
    },

    async createPage(organizationId: string, data: Omit<IContentPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const existing = await pagesRepo.findBySlug(organizationId, data.slug);
      if (existing) throw new HTTPException(400, { message: 'El slug ya está en uso en esta organización' });

      return pagesRepo.create(organizationId, data);
    },

    async updatePage(organizationId: string, id: number, data: Partial<IContentPage>) {
      const existingPage = await pagesRepo.findById(organizationId, id);
      if (!existingPage) throw new HTTPException(404, { message: 'Página no encontrada' });

      // Slug uniqueness is enforced by the DB unique index
      // (content_page_org_slug_idx) — check before writing so the panel gets a
      // friendly 400 instead of a 500 from a unique violation.
      if (data.slug) {
        const existing = await pagesRepo.findBySlug(organizationId, data.slug);
        if (existing && existing.id !== id) {
          throw new HTTPException(400, { message: 'El slug ya está en uso en esta organización' });
        }
      }

      return pagesRepo.update(organizationId, id, data);
    },

    async deletePage(organizationId: string, id: number) {
      const existingPage = await pagesRepo.findById(organizationId, id);
      if (!existingPage) throw new HTTPException(404, { message: 'Página no encontrada' });
      return pagesRepo.delete(organizationId, id);
    },
  };
}

export type ContentPagesService = ReturnType<typeof createContentPagesService>;
