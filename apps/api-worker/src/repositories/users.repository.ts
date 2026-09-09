import { and, desc, eq, ilike, inArray, or, type Db } from '@workspace/database/factory';
import { user } from '@workspace/database/schema';
import { platformRoles } from '@workspace/shared';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export interface PlatformStaffFilter {
  role?: string;
  search?: string;
}

export function createUsersRepository(db: Db) {
  return {
    async findAll() {
      return db.select().from(user);
    },

    /**
     * Users with a platform role (support, admin, owner) — the SaaS staff.
     * Role values come from `platformRoles` keys to avoid magic strings.
     * Optional `role` narrows to one platform role; optional `search`
     * matches name or email (ILIKE, case-insensitive).
     */
    async findPlatformStaff(filters: PlatformStaffFilter = {}) {
      const roles = Object.keys(platformRoles);
      const conditions = [inArray(user.role, roles)];

      if (filters.role && roles.includes(filters.role)) {
        conditions.push(eq(user.role, filters.role));
      }

      if (filters.search) {
        const pattern = `%${filters.search}%`;
        conditions.push(or(ilike(user.name, pattern), ilike(user.email, pattern))!);
      }

      return db
        .select()
        .from(user)
        .where(and(...conditions))
        .orderBy(desc(user.createdAt));
    },

    async countByRole(role: string) {
      const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, role));
      return rows.length;
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
