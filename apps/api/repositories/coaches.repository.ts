import { eq, ilike, and, db, count, asc } from '@workspace/database/client';
import { cmsCoaches } from '@workspace/database/schema';

export type CmsCoach = typeof cmsCoaches.$inferSelect;
export type NewCmsCoach = typeof cmsCoaches.$inferInsert;

export interface CoachesFilter {
  name?: string;
  role?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface PaginatedCoaches {
  data: CmsCoach[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const coachesRepository = {
  async findAll(filters: CoachesFilter = {}): Promise<PaginatedCoaches> {
    const { name, role, isVisible, page = 1, limit = 10, requireTotal = true } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (name) conditions.push(ilike(cmsCoaches.name, `%${name}%`));
    if (role) conditions.push(ilike(cmsCoaches.role, `%${role}%`));
    if (isVisible !== undefined) conditions.push(eq(cmsCoaches.isVisible, isVisible));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rowsQuery = db.select().from(cmsCoaches).where(where).orderBy(asc(cmsCoaches.displayOrder), asc(cmsCoaches.id)).limit(limit).offset(offset);

    if (!requireTotal) {
      const rows = await rowsQuery;
      return { data: rows, total: -1, page, limit, totalPages: -1 };
    }

    const [rows, countResult] = await Promise.all([
      rowsQuery,
      db.select({ total: count() }).from(cmsCoaches).where(where),
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
    const [result] = await db.select().from(cmsCoaches).where(eq(cmsCoaches.id, id));
    return result;
  },

  async create(data: NewCmsCoach) {
    const [newCoach] = await db.insert(cmsCoaches).values(data).returning();
    return newCoach;
  },

  async update(id: number, data: Partial<NewCmsCoach>) {
    const [updatedCoach] = await db
      .update(cmsCoaches)
      .set(data)
      .where(eq(cmsCoaches.id, id))
      .returning();
    return updatedCoach;
  },

  async delete(id: number) {
    await db.delete(cmsCoaches).where(eq(cmsCoaches.id, id));
  }
};
