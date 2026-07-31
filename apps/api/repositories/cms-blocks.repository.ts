import { db, eq, and, asc } from '@workspace/database/client'
import { contentBlock } from '@workspace/database/schema'

export type CmsBlockType = 'hero' | 'services' | 'classes_info' | 'testimonials' | 'gallery' | 'contact' | 'team_info';

export interface ICmsBlock {
  id: number
  organizationId: string
  pageId: number
  blockType: CmsBlockType
  data: any // Validated by Zod at service layer
  isVisible: boolean
  displayOrder: number
  createdAt?: Date
  updatedAt?: Date
}

export const cmsBlocksRepository = {
  async findByPageId(organizationId: string, pageId: number): Promise<ICmsBlock[]> {
    const records = await db
      .select()
      .from(contentBlock)
      .where(and(eq(contentBlock.pageId, pageId), eq(contentBlock.organizationId, organizationId)))
      .orderBy(asc(contentBlock.displayOrder))
    
    return records as unknown as ICmsBlock[]
  },

  async findById(organizationId: string, id: number): Promise<ICmsBlock | undefined> {
    const records = await db
      .select()
      .from(contentBlock)
      .where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)))
    
    return records[0] as unknown as ICmsBlock | undefined
  },

  async create(organizationId: string, data: Omit<ICmsBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<ICmsBlock> {
    const inserted = await db.insert(contentBlock).values({
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
      .update(contentBlock)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)))
      .returning()
    
    return updated[0] as unknown as ICmsBlock
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await db.delete(contentBlock).where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)))
  },

  /**
   * Updates display order of multiple blocks within the same page sequentially.
   * Expects an array of { id: number, displayOrder: number }.
   */
  async updateBulkOrder(organizationId: string, pageId: number, orders: { id: number, displayOrder: number }[]): Promise<void> {
    for (const item of orders) {
      await db
        .update(contentBlock)
        .set({ 
          displayOrder: item.displayOrder,
          updatedAt: new Date()
        })
        .where(and(
          eq(contentBlock.id, item.id),
          eq(contentBlock.pageId, pageId),
          eq(contentBlock.organizationId, organizationId)
        ))
    }
  }
}
