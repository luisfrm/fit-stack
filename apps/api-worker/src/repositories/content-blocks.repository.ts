import { eq, and, asc, sql, type Db } from '@workspace/database/factory';
import { contentBlock } from '@workspace/database/schema';

/**
 * Offset used by `updateBulkOrder` to move rows out of the final display-order
 * range before applying new values. Serverless-safe: it avoids `db.transaction`
 * (interactive transactions need a persistent connection) while guaranteeing
 * the unique index `content_block_page_order_idx (pageId, displayOrder)` is
 * never violated, because each individual UPDATE is collision-free.
 *
 * Block counts per page are in the tens; 100_000 is effectively unbounded.
 */
const REORDER_OFFSET = 100_000;

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

    /**
     * Applies a new display order to a page's blocks without using a
     * transaction (serverless/Neon HTTP driver).
     *
     * Strategy (each statement is individually collision-free on the unique
     * index `(pageId, displayOrder)`):
     *
     * 1. Shift EVERY block of the page by `REORDER_OFFSET`. Adding a constant
     *    preserves uniqueness, so this can never collide.
     * 2. Apply the final orders one by one — the targets are all `< REORDER_OFFSET`,
     *    while every untouched row still sits at `>= REORDER_OFFSET`.
     * 3. Any block not mentioned in `orders` (defensive) gets restored to a
     *    compact sequence starting after the highest requested order.
     *
     * If a step fails midway the page is left with shifted-but-consistent
     * orders (still unique), never with a 500 from a unique violation.
     */
    async updateBulkOrder(organizationId: string, pageId: number, orders: { id: number; displayOrder: number }[]): Promise<void> {
      const now = new Date();

      // Phase 1 — move every row out of the final range.
      await db
        .update(contentBlock)
        .set({
          displayOrder: sql`${contentBlock.displayOrder} + ${REORDER_OFFSET}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(contentBlock.pageId, pageId),
            eq(contentBlock.organizationId, organizationId)
          )
        );

      // Phase 2 — apply the requested final orders.
      for (const item of orders) {
        await db
          .update(contentBlock)
          .set({
            displayOrder: item.displayOrder,
            updatedAt: now,
          })
          .where(
            and(
              eq(contentBlock.id, item.id),
              eq(contentBlock.pageId, pageId),
              eq(contentBlock.organizationId, organizationId)
            )
          );
      }

      // Phase 3 — restore any block the caller did not mention.
      const leftovers = await db
        .select({ id: contentBlock.id, displayOrder: contentBlock.displayOrder })
        .from(contentBlock)
        .where(
          and(
            eq(contentBlock.pageId, pageId),
            eq(contentBlock.organizationId, organizationId),
            sql`${contentBlock.displayOrder} >= ${REORDER_OFFSET}`
          )
        );

      let nextOrder = orders.reduce((max, o) => Math.max(max, o.displayOrder), -1) + 1;
      for (const leftover of leftovers) {
        await db
          .update(contentBlock)
          .set({ displayOrder: nextOrder++, updatedAt: now })
          .where(eq(contentBlock.id, leftover.id));
      }
    },

    /**
     * Next safe display order for a new block: `max(existing) + 1`.
     * Using `max + 1` (instead of a raw count) avoids colliding with the unique
     * index when blocks were deleted leaving gaps in the sequence.
     */
    async getNextDisplayOrder(organizationId: string, pageId: number): Promise<number> {
      const rows = await db
        .select({ displayOrder: contentBlock.displayOrder })
        .from(contentBlock)
        .where(
          and(
            eq(contentBlock.pageId, pageId),
            eq(contentBlock.organizationId, organizationId)
          )
        );

      return rows.reduce((max, row) => Math.max(max, row.displayOrder), -1) + 1;
    },
  };
}

export type ContentBlocksRepository = ReturnType<typeof createContentBlocksRepository>;
