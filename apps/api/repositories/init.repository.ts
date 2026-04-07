import { db, count, eq } from '@workspace/database/client';
import { user as userTable } from '@workspace/database/schema';
import { GlobalRole } from '@workspace/shared';

export const initRepository = {
  /**
   * Count the total number of users in the system.
   */
  async countUsers(): Promise<number> {
    const [result] = await db.select({ value: count() }).from(userTable);
    return Number(result?.value || 0);
  },

  /**
   * Update a user's role by their ID.
   */
  async updateUserRole(userId: string, role: GlobalRole) {
    const [updatedUser] = await db
      .update(userTable)
      .set({ role })
      .where(eq(userTable.id, userId))
      .returning();
    
    return updatedUser;
  }
};
