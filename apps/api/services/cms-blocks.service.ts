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
  async getPageBlocks(organizationId: string, pageId: number) {
    return await cmsBlocksRepository.findByPageId(organizationId, pageId)
  },

  /**
   * Endpoint público: Obtiene la página por slug y todos sus bloques visibles.
   */
  async getPublicPage(organizationId: string, slug: string) {
    const page = await cmsPagesRepository.findBySlug(organizationId, slug)
    if (!page?.isActive) {
      throw new Error('Página no encontrada o inactiva')
    }

    const blocks = await cmsBlocksRepository.findByPageId(organizationId, page.id)
    return {
      ...page,
      blocks: blocks.filter(b => b.isVisible)
    }
  },

  async createBlock(organizationId: string, data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>) {
    // Validar integridad del JSONB
    const validatedData = validateBlockData(data.blockType, data.data)
    
    return await cmsBlocksRepository.create(organizationId, {
      ...data,
      data: validatedData
    })
  },

  async updateBlock(organizationId: string, id: number, data: Partial<ICmsBlock>) {
    const block = await cmsBlocksRepository.findById(organizationId, id)
    if (!block) throw new Error('Bloque no encontrado')

    // Si se actualiza data o blockType, re-validar
    if (data.data || data.blockType) {
      const type = data.blockType || block.blockType
      const content = data.data || block.data
      data.data = validateBlockData(type, content)
    }

    return await cmsBlocksRepository.update(organizationId, id, data)
  },

  async deleteBlock(organizationId: string, id: number) {
    return await cmsBlocksRepository.delete(organizationId, id)
  },

  /**
   * Reordenar bloques en lote (Batch Update).
   */
  async reorderBlocks(organizationId: string, pageId: number, orders: { id: number, displayOrder: number }[]) {
    return await cmsBlocksRepository.updateBulkOrder(organizationId, pageId, orders)
  }
}
