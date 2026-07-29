import { eq, and, type Db } from '@workspace/database/factory';
import { contentPage } from '@workspace/database/schema';

export interface IContentPage {
  id: number;
  organizationId: string;
  slug: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createContentPagesRepository(db: Db) {
  return {
    async findAll(organizationId: string): Promise<IContentPage[]> {
      const records = await db
        .select()
        .from(contentPage)
        .where(eq(contentPage.organizationId, organizationId))
        .orderBy(contentPage.id);
      return records as unknown as IContentPage[];
    },

    async findById(organizationId: string, id: number): Promise<IContentPage | undefined> {
      const records = await db
        .select()
        .from(contentPage)
        .where(and(eq(contentPage.id, id), eq(contentPage.organizationId, organizationId)));
      return records[0] as unknown as IContentPage | undefined;
    },

    async findBySlug(organizationId: string, slug: string): Promise<IContentPage | undefined> {
      const records = await db
        .select()
        .from(contentPage)
        .where(and(eq(contentPage.slug, slug), eq(contentPage.organizationId, organizationId)));
      return records[0] as unknown as IContentPage | undefined;
    },

    async create(organizationId: string, data: Omit<IContentPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<IContentPage> {
      const inserted = await db
        .insert(contentPage)
        .values({
          organizationId,
          slug: data.slug,
          title: data.title,
          description: data.description,
          isActive: data.isActive,
        })
        .returning();
      return inserted[0] as unknown as IContentPage;
    },

    async update(organizationId: string, id: number, data: Partial<IContentPage>): Promise<IContentPage> {
      const updated = await db
        .update(contentPage)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(contentPage.id, id), eq(contentPage.organizationId, organizationId)))
        .returning();
      return updated[0] as unknown as IContentPage;
    },

    async delete(organizationId: string, id: number): Promise<void> {
      await db.delete(contentPage).where(and(eq(contentPage.id, id), eq(contentPage.organizationId, organizationId)));
    },
  };
}

export type ContentPagesRepository = ReturnType<typeof createContentPagesRepository>;
