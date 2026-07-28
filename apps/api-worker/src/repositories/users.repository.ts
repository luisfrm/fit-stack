import { eq, type Db } from '@workspace/database/factory';
import { user } from '@workspace/database/schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export function createUsersRepository(db: Db) {
  return {
    async findAll() {
      return db.select().from(user);
    },

    async findById(id: string) {
      const [result] = await db.select().from(user).where(eq(user.id, id));
      return result;
    },

    async findByEmail(email: string) {
      const [result] = await db.select().from(user).where(eq(user.email, email));
      return result;
    },

    async create(data: NewUser) {
      const [newUser] = await db.insert(user).values(data).returning();
      return newUser;
    },

    async update(id: string, data: Partial<NewUser>) {
      const [updatedUser] = await db
        .update(user)
        .set(data)
        .where(eq(user.id, id))
        .returning();
      return updatedUser;
    },

    async delete(id: string) {
      await db.delete(user).where(eq(user.id, id));
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
