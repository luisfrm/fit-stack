import type { ContentBlocksRepository, IContentBlock } from '../repositories/content-blocks.repository';
import type { ContentPagesRepository } from '../repositories/content-pages.repository';
import { validateBlockData } from '../lib/content-block-config';

export function createContentBlocksService(
  blocksRepo: ContentBlocksRepository,
  pagesRepo: ContentPagesRepository
) {
  return {
    async getPageBlocks(organizationId: string, pageId: number) {
      return blocksRepo.findByPageId(organizationId, pageId);
    },

    async getPublicPage(organizationId: string, slug: string) {
      const page = await pagesRepo.findBySlug(organizationId, slug);
      if (!page?.isActive) {
        throw new Error('Página no encontrada o inactiva');
      }

      const blocks = await blocksRepo.findByPageId(organizationId, page.id);
      return {
        ...page,
        blocks: blocks.filter((b) => b.isVisible),
      };
    },

    async createBlock(organizationId: string, data: Omit<IContentBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const validatedData = validateBlockData(data.blockType, data.data);

      return blocksRepo.create(organizationId, {
        ...data,
        data: validatedData,
      });
    },

    async updateBlock(organizationId: string, id: number, data: Partial<IContentBlock>) {
      const block = await blocksRepo.findById(organizationId, id);
      if (!block) throw new Error('Bloque no encontrado');

      if (data.data || data.blockType) {
        const type = data.blockType || block.blockType;
        const content = data.data || block.data;
        data.data = validateBlockData(type, content);
      }

      return blocksRepo.update(organizationId, id, data);
    },

    async deleteBlock(organizationId: string, id: number) {
      return blocksRepo.delete(organizationId, id);
    },

    async reorderBlocks(organizationId: string, pageId: number, orders: { id: number; displayOrder: number }[]) {
      return blocksRepo.updateBulkOrder(organizationId, pageId, orders);
    },
  };
}

export type ContentBlocksService = ReturnType<typeof createContentBlocksService>;
