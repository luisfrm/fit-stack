import { eq, and, asc, type Db } from '@workspace/database/factory';
import { contentBlock } from '@workspace/database/schema';

export type ContentBlockType =
  | 'hero'
  | 'services'
  | 'classes'
  | 'testimonials'
  | 'gallery'
  | 'contact'
  | 'team';

export interface IContentBlock {
  id: number;
  organizationId: string;
  pageId: number;
  blockType: ContentBlockType;
  data: any;
  isVisible: boolean;
  displayOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createContentBlocksRepository(db: Db) {
  return {
    async findByPageId(organizationId: string, pageId: number): Promise<IContentBlock[]> {
      const records = await db
        .select()
        .from(contentBlock)
        .where(and(eq(contentBlock.pageId, pageId), eq(contentBlock.organizationId, organizationId)))
        .orderBy(asc(contentBlock.displayOrder));

      return records as unknown as IContentBlock[];
    },

    async findById(organizationId: string, id: number): Promise<IContentBlock | undefined> {
      const records = await db
        .select()
        .from(contentBlock)
        .where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)));

      return records[0] as unknown as IContentBlock | undefined;
    },

    async create(organizationId: string, data: Omit<IContentBlock, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<IContentBlock> {
      const inserted = await db
        .insert(contentBlock)
        .values({
          organizationId,
          pageId: data.pageId,
          blockType: data.blockType,
          data: data.data,
          isVisible: data.isVisible,
          displayOrder: data.displayOrder,
        })
        .returning();

      return inserted[0] as unknown as IContentBlock;
    },

    async update(organizationId: string, id: number, data: Partial<IContentBlock>): Promise<IContentBlock> {
      const updated = await db
        .update(contentBlock)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)))
        .returning();

      return updated[0] as unknown as IContentBlock;
    },

    async delete(organizationId: string, id: number): Promise<void> {
      await db.delete(contentBlock).where(and(eq(contentBlock.id, id), eq(contentBlock.organizationId, organizationId)));
    },

    async updateBulkOrder(organizationId: string, pageId: number, orders: { id: number; displayOrder: number }[]): Promise<void> {
      await db.transaction(async (tx) => {
        for (const item of orders) {
          await tx
            .update(contentBlock)
            .set({
              displayOrder: item.displayOrder,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(contentBlock.id, item.id),
                eq(contentBlock.pageId, pageId),
                eq(contentBlock.organizationId, organizationId)
              )
            );
        }
      });
    },
  };
}

export type ContentBlocksRepository = ReturnType<typeof createContentBlocksRepository>;
