import { eq, ilike, and, or, count, desc, db } from '@workspace/database/client';
import { members } from '@workspace/database/schema';

export type DbMember = typeof members.$inferSelect;
export type NewDbMember = typeof members.$inferInsert;

export interface MembersFilter {
  query?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface PaginatedMembersResult {
  data: DbMember[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const membersRepository = {
  async findAll(filters: MembersFilter = {}): Promise<PaginatedMembersResult> {
    const { query, role, isActive, page = 1, limit = 10, requireTotal = true } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(members.firstName, `%${query}%`),
          ilike(members.lastName, `%${query}%`),
          ilike(members.email, `%${query}%`)
        )
      );
    }
    
    if (role) {
      conditions.push(eq(members.role, role as any));
    }

    if (isActive !== undefined) {
      conditions.push(eq(members.isActive, isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rowsQuery = db
      .select()
      .from(members)
      .where(whereClause)
      .orderBy(desc(members.createdAt))
      .limit(limit)
      .offset(offset);

    if (!requireTotal) {
      const rows = await rowsQuery;
      return { data: rows, total: -1, page, limit, totalPages: -1 };
    }

    const [rows, countResult] = await Promise.all([
      rowsQuery,
      db.select({ total: count() }).from(members).where(whereClause),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(id: number) {
    const [result] = await db.select().from(members).where(eq(members.id, id));
    return result;
  },

  async findByEmail(email: string) {
    const [result] = await db.select().from(members).where(eq(members.email, email));
    return result;
  },

  async create(data: NewDbMember) {
    const [newMember] = await db.insert(members).values(data).returning();
    return newMember;
  },

  async update(id: number, data: Partial<NewDbMember>) {
    const [updatedMember] = await db
      .update(members)
      .set(data)
      .where(eq(members.id, id))
      .returning();
    return updatedMember;
  },

  async delete(id: number) {
    await db.delete(members).where(eq(members.id, id));
  }
};
