import { db, eq, and, asc } from '@workspace/database/client'
import { cmsPageBlocks } from '@workspace/database/schema'

export type CmsBlockType = 'hero' | 'services' | 'classes_info' | 'testimonials' | 'gallery' | 'contact' | 'team_info';

export interface ICmsBlock {
  id: number
  organizationId: string
  pageId: number
  blockType: CmsBlockType
  data: any // Validado por Zod en la capa de Servicio
  isVisible: boolean
  displayOrder: number
  createdAt?: Date
  updatedAt?: Date
}

export const cmsBlocksRepository = {
  async findByPageId(organizationId: string, pageId: number): Promise<ICmsBlock[]> {
    const records = await db
      .select()
      .from(cmsPageBlocks)
      .where(and(eq(cmsPageBlocks.pageId, pageId), eq(cmsPageBlocks.organizationId, organizationId)))
      .orderBy(asc(cmsPageBlocks.displayOrder))
    
    return records as unknown as ICmsBlock[]
  },

  async findById(organizationId: string, id: number): Promise<ICmsBlock | undefined> {
    const records = await db
      .select()
      .from(cmsPageBlocks)
      .where(and(eq(cmsPageBlocks.id, id), eq(cmsPageBlocks.organizationId, organizationId)))
    
    return records[0] as unknown as ICmsBlock | undefined
  },

  async create(organizationId: string, data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<ICmsBlock> {
    const inserted = await db.insert(cmsPageBlocks).values({
      organizationId,
      pageId: data.pageId,
      blockType: data.blockType,
      data: data.data,
      isVisible: data.isVisible,
      displayOrder: data.displayOrder,
    }).returning()
    
    return inserted[0] as unknown as ICmsBlock
  },

  async update(organizationId: string, id: number, data: Partial<ICmsBlock>): Promise<ICmsBlock> {
    const updated = await db
      .update(cmsPageBlocks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(cmsPageBlocks.id, id), eq(cmsPageBlocks.organizationId, organizationId)))
      .returning()
    
    return updated[0] as unknown as ICmsBlock
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await db.delete(cmsPageBlocks).where(and(eq(cmsPageBlocks.id, id), eq(cmsPageBlocks.organizationId, organizationId)))
  },

  /**
   * Actualiza el orden de múltiples bloques dentro de una misma página de manera atómica.
   * Se espera un array de { id: number, displayOrder: number }.
   */
  async updateBulkOrder(organizationId: string, pageId: number, orders: { id: number, displayOrder: number }[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of orders) {
        await tx
          .update(cmsPageBlocks)
          .set({ 
            displayOrder: item.displayOrder,
            updatedAt: new Date()
          })
          .where(and(
            eq(cmsPageBlocks.id, item.id),
            eq(cmsPageBlocks.pageId, pageId),
            eq(cmsPageBlocks.organizationId, organizationId)
          ))
      }
    })
  }
}
