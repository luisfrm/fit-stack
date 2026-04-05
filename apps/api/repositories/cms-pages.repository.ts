import { db, eq, and } from '@workspace/database/client'
import { cmsPages } from '@workspace/database/schema'

export interface ICmsPage {
  id: number
  organizationId: string
  slug: string
  title: string
  description: string | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export const cmsPagesRepository = {
  async findAll(organizationId: string): Promise<ICmsPage[]> {
    const records = await db.select().from(cmsPages)
      .where(eq(cmsPages.organizationId, organizationId))
      .orderBy(cmsPages.id)
    return records as unknown as ICmsPage[]
  },

  async findById(organizationId: string, id: number): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPages).where(and(
      eq(cmsPages.id, id),
      eq(cmsPages.organizationId, organizationId)
    ))
    return records[0] as unknown as ICmsPage | undefined
  },

  async findBySlug(organizationId: string, slug: string): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPages).where(and(
      eq(cmsPages.slug, slug),
      eq(cmsPages.organizationId, organizationId)
    ))
    return records[0] as unknown as ICmsPage | undefined
  },

  async create(organizationId: string, data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<ICmsPage> {
    const inserted = await db.insert(cmsPages).values({
      organizationId,
      slug: data.slug,
      title: data.title,
      description: data.description,
      isActive: data.isActive,
    }).returning()
    return inserted[0] as unknown as ICmsPage
  },

  async update(organizationId: string, id: number, data: Partial<ICmsPage>): Promise<ICmsPage> {
    const updated = await db
      .update(cmsPages)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(cmsPages.id, id), eq(cmsPages.organizationId, organizationId)))
      .returning()
    return updated[0] as unknown as ICmsPage
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await db.delete(cmsPages).where(and(eq(cmsPages.id, id), eq(cmsPages.organizationId, organizationId)))
  }
}
