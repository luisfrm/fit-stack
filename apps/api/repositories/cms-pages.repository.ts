import { db, eq, and } from '@workspace/database/client'
import { cmsPage } from '@workspace/database/schema'

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
    const records = await db.select().from(cmsPage)
      .where(eq(cmsPage.organizationId, organizationId))
      .orderBy(cmsPage.id)
    return records as unknown as ICmsPage[]
  },

  async findById(organizationId: string, id: number): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPage).where(and(
      eq(cmsPage.id, id),
      eq(cmsPage.organizationId, organizationId)
    ))
    return records[0] as unknown as ICmsPage | undefined
  },

  async findBySlug(organizationId: string, slug: string): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPage).where(and(
      eq(cmsPage.slug, slug),
      eq(cmsPage.organizationId, organizationId)
    ))
    return records[0] as unknown as ICmsPage | undefined
  },

  async create(organizationId: string, data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>): Promise<ICmsPage> {
    const inserted = await db.insert(cmsPage).values({
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
      .update(cmsPage)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(cmsPage.id, id), eq(cmsPage.organizationId, organizationId)))
      .returning()
    return updated[0] as unknown as ICmsPage
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await db.delete(cmsPage).where(and(eq(cmsPage.id, id), eq(cmsPage.organizationId, organizationId)))
  }
}
