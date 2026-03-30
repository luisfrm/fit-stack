import { 
  cmsBlocksRepository, 
  ICmsBlock 
} from '../repositories/cms-blocks.repository'
import { cmsPagesRepository } from '../repositories/cms-pages.repository'
import { validateBlockData } from '../config/cms-block-config'

export const cmsBlocksService = {
  /**
   * Obtiene todos los bloques de una página por su ID de base de datos.
   */
  async getPageBlocks(pageId: number) {
    return await cmsBlocksRepository.findByPageId(pageId)
  },

  /**
   * Endpoint público: Obtiene la página por slug y todos sus bloques visibles.
   */
  async getPublicPage(slug: string) {
    const page = await cmsPagesRepository.findBySlug(slug)
    if (!page?.isActive) {
      throw new Error('Página no encontrada o inactiva')
    }

    const blocks = await cmsBlocksRepository.findByPageId(page.id)
    return {
      ...page,
      blocks: blocks.filter(b => b.isVisible)
    }
  },

  async createBlock(data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt'>) {
    // Validar integridad del JSONB
    const validatedData = validateBlockData(data.blockType, data.data)
    
    return await cmsBlocksRepository.create({
      ...data,
      data: validatedData
    })
  },

  async updateBlock(id: number, data: Partial<ICmsBlock>) {
    const block = await cmsBlocksRepository.findById(id)
    if (!block) throw new Error('Bloque no encontrado')

    // Si se actualiza data o blockType, re-validar
    if (data.data || data.blockType) {
      const type = data.blockType || block.blockType
      const content = data.data || block.data
      data.data = validateBlockData(type, content)
    }

    return await cmsBlocksRepository.update(id, data)
  },

  async deleteBlock(id: number) {
    return await cmsBlocksRepository.delete(id)
  },

  /**
   * Reordenar bloques en lote (Batch Update).
   * @param pageId ID de la página
   * @param orders Array de { id: blockId, displayOrder: number }
   */
  async reorderBlocks(pageId: number, orders: { id: number, displayOrder: number }[]) {
    return await cmsBlocksRepository.updateBulkOrder(pageId, orders)
  }
}
