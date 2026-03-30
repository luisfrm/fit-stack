import { db, eq } from '@workspace/database/client'
import { cmsPages } from '@workspace/database/schema'

export interface ICmsPage {
  id: number
  slug: string
  title: string
  description: string | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export const cmsPagesRepository = {
  async findAll(): Promise<ICmsPage[]> {
    const records = await db.select().from(cmsPages).orderBy(cmsPages.id)
    return records as ICmsPage[]
  },

  async findById(id: number): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPages).where(eq(cmsPages.id, id))
    return records[0] as ICmsPage | undefined
  },

  async findBySlug(slug: string): Promise<ICmsPage | undefined> {
    const records = await db.select().from(cmsPages).where(eq(cmsPages.slug, slug))
    return records[0] as ICmsPage | undefined
  },

  async create(data: Omit<ICmsPage, 'id' | 'createdAt' | 'updatedAt'>): Promise<ICmsPage> {
    const inserted = await db.insert(cmsPages).values({
      slug: data.slug,
      title: data.title,
      description: data.description,
      isActive: data.isActive,
    }).returning()
    return inserted[0] as ICmsPage
  },

  async update(id: number, data: Partial<ICmsPage>): Promise<ICmsPage> {
    const updated = await db
      .update(cmsPages)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(cmsPages.id, id))
      .returning()
    return updated[0] as ICmsPage
  },

  async delete(id: number): Promise<void> {
    await db.delete(cmsPages).where(eq(cmsPages.id, id))
  }
}
