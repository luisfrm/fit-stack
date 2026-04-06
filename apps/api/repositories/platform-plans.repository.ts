import { eq, db } from '@workspace/database/client';
import { fitstackPlan } from '@workspace/database/schema';

export type DbPlatformPlan = typeof fitstackPlan.$inferSelect;
export type NewDbPlatformPlan = typeof fitstackPlan.$inferInsert;

export const platformPlansRepository = {
  async findAll() {
    return db.select().from(fitstackPlan).where(eq(fitstackPlan.isActive, true));
  },

  async findById(id: number): Promise<DbPlatformPlan | undefined> {
    const [result] = await db
      .select()
      .from(fitstackPlan)
      .where(eq(fitstackPlan.id, id))
      .limit(1);
    return result;
  },

  async create(data: NewDbPlatformPlan) {
    const [newPlan] = await db.insert(fitstackPlan).values(data).returning();
    return newPlan;
  },

  async update(id: number, data: Partial<NewDbPlatformPlan>) {
    const [updatedPlan] = await db
      .update(fitstackPlan)
      .set(data)
      .where(eq(fitstackPlan.id, id))
      .returning();
    return updatedPlan;
  },

  async delete(id: number) {
    await db.update(fitstackPlan).set({ isActive: false }).where(eq(fitstackPlan.id, id));
  }
};
