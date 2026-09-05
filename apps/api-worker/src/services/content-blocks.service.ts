import type { ContentBlocksRepository, IContentBlock } from '../repositories/content-blocks.repository';
import type { ContentPagesRepository } from '../repositories/content-pages.repository';
import { validateBlockData } from '../lib/content-block-config';
import { HTTPException } from 'hono/http-exception';

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
        throw new HTTPException(404, { message: 'Página no encontrada o inactiva' });
      }

      const blocks = await blocksRepo.findByPageId(organizationId, page.id);
      return {
        ...page,
        blocks: blocks.filter((b) => b.isVisible),
      };
    },

    async createBlock(organizationId: string, data: Omit<IContentBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
      const validatedData = validateBlockData(data.blockType, data.data);

      const displayOrder =
        data.displayOrder === undefined
          ? await blocksRepo.getNextDisplayOrder(organizationId, data.pageId)
          : data.displayOrder;

      return blocksRepo.create(organizationId, {
        ...data,
        data: validatedData,
        displayOrder,
      });
    },

    async updateBlock(organizationId: string, id: number, data: Partial<IContentBlock>) {
      const block = await blocksRepo.findById(organizationId, id);
      if (!block) throw new HTTPException(404, { message: 'Bloque no encontrado' });

      if (data.data || data.blockType) {
        const type = data.blockType || block.blockType;
        const content = data.data || block.data;
        data.data = validateBlockData(type, content);
      }

      return blocksRepo.update(organizationId, id, data);
    },

    async deleteBlock(organizationId: string, id: number) {
      const block = await blocksRepo.findById(organizationId, id);
      if (!block) throw new HTTPException(404, { message: 'Bloque no encontrado' });
      return blocksRepo.delete(organizationId, id);
    },

    async reorderBlocks(organizationId: string, pageId: number, orders: { id: number; displayOrder: number }[]) {
      const existing = await blocksRepo.findByPageId(organizationId, pageId);
      const existingIds = new Set(existing.map((b) => b.id));

      // Reject payloads referencing blocks that don't belong to this page (or
      // duplicated ids) — keeps the reorder deterministic and org-scoped.
      const seen = new Set<number>();
      for (const item of orders) {
        if (!existingIds.has(item.id) || seen.has(item.id)) {
          throw new HTTPException(400, { message: 'El listado de órdenes contiene bloques inválidos para esta página' });
        }
        seen.add(item.id);
      }

      return blocksRepo.updateBulkOrder(organizationId, pageId, orders);
    },
  };
}

export type ContentBlocksService = ReturnType<typeof createContentBlocksService>;
