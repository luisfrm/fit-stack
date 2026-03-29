import { eq, db } from '@workspace/database/client';
import { cmsClasses } from '@workspace/database/schema';

// Types inferred from schema
export type CmsClass = typeof cmsClasses.$inferSelect;
export type NewCmsClass = typeof cmsClasses.$inferInsert;

export const classesRepository = {
  async findAll() {
    return db.select().from(cmsClasses);
  },

  async findById(id: number) {
    const [result] = await db.select().from(cmsClasses).where(eq(cmsClasses.id, id));
    return result;
  },

  async create(data: NewCmsClass) {
    const [newClass] = await db.insert(cmsClasses).values(data).returning();
    return newClass;
  },

  async update(id: number, data: Partial<NewCmsClass>) {
    const [updatedClass] = await db
      .update(cmsClasses)
      .set(data)
      .where(eq(cmsClasses.id, id))
      .returning();
    return updatedClass;
  },

  async delete(id: number) {
    await db.delete(cmsClasses).where(eq(cmsClasses.id, id));
  }
};
