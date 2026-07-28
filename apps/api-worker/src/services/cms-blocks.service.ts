import type { CmsBlocksRepository, ICmsBlock } from '../repositories/cms-blocks.repository';
import type { CmsPagesRepository } from '../repositories/cms-pages.repository';
import { validateBlockData } from '../lib/cms-block-config';

export function createCmsBlocksService(
  blocksRepo: CmsBlocksRepository,
  pagesRepo: CmsPagesRepository
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

    async createBlock(organizationId: string, data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const validatedData = validateBlockData(data.blockType, data.data);

      return blocksRepo.create(organizationId, {
        ...data,
        data: validatedData,
      });
    },

    async updateBlock(organizationId: string, id: number, data: Partial<ICmsBlock>) {
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

export type CmsBlocksService = ReturnType<typeof createCmsBlocksService>;
