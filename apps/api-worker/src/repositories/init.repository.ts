import { count, eq, type Db } from '@workspace/database/factory';
import { user as userTable } from '@workspace/database/schema';
import type { GlobalRole } from '@workspace/shared';

export function createInitRepository(db: Db) {
  return {
    async countUsers(): Promise<number> {
      const [result] = await db.select({ value: count() }).from(userTable);
      return Number(result?.value || 0);
    },

    async updateUserRole(userId: string, role: GlobalRole) {
      const [updatedUser] = await db
        .update(userTable)
        .set({ role })
        .where(eq(userTable.id, userId))
        .returning();

      return updatedUser;
    },
  };
}

export type InitRepository = ReturnType<typeof createInitRepository>;
