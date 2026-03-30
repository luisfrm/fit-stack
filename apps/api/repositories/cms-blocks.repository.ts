import { db, eq, and, asc } from '@workspace/database/client'
import { cmsPageBlocks } from '@workspace/database/schema'

export type CmsBlockType = 'hero' | 'services' | 'classes_info' | 'testimonials' | 'gallery' | 'contact' | 'team_info';

export interface ICmsBlock {
  id: number
  pageId: number
  blockType: CmsBlockType
  data: any // Validado por Zod en la capa de Servicio
  isVisible: boolean
  displayOrder: number
  createdAt?: Date
  updatedAt?: Date
}

export const cmsBlocksRepository = {
  async findByPageId(pageId: number): Promise<ICmsBlock[]> {
    const records = await db
      .select()
      .from(cmsPageBlocks)
      .where(eq(cmsPageBlocks.pageId, pageId))
      .orderBy(asc(cmsPageBlocks.displayOrder))
    
    return records as unknown as ICmsBlock[]
  },

  async findById(id: number): Promise<ICmsBlock | undefined> {
    const records = await db
      .select()
      .from(cmsPageBlocks)
      .where(eq(cmsPageBlocks.id, id))
    
    return records[0] as unknown as ICmsBlock | undefined
  },

  async create(data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<ICmsBlock> {
    const inserted = await db.insert(cmsPageBlocks).values({
      pageId: data.pageId,
      blockType: data.blockType,
      data: data.data,
      isVisible: data.isVisible,
      displayOrder: data.displayOrder,
    }).returning()
    
    return inserted[0] as unknown as ICmsBlock
  },

  async update(id: number, data: Partial<ICmsBlock>): Promise<ICmsBlock> {
    const updated = await db
      .update(cmsPageBlocks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(cmsPageBlocks.id, id))
      .returning()
    
    return updated[0] as unknown as ICmsBlock
  },

  async delete(id: number): Promise<void> {
    await db.delete(cmsPageBlocks).where(eq(cmsPageBlocks.id, id))
  },

  /**
   * Actualiza el orden de múltiples bloques dentro de una misma página de manera atómica.
   * Se espera un array de { id: number, displayOrder: number }.
   */
  async updateBulkOrder(pageId: number, orders: { id: number, displayOrder: number }[]): Promise<void> {
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
            eq(cmsPageBlocks.pageId, pageId)
          ))
      }
    })
  }
}
