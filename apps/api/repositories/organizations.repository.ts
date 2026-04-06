import { eq, ilike, and, or, count, desc, db } from '@workspace/database/client';
import { organization } from '@workspace/database/schema';

export type DbOrganization = typeof organization.$inferSelect;
export type NewDbOrganization = typeof organization.$inferInsert;

export interface OrganizationFilter {
  query?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedOrganizationsResult {
  data: DbOrganization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const organizationsRepository = {
  async findAll(filters: OrganizationFilter): Promise<PaginatedOrganizationsResult> {
    const { query, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(organization.name, `%${query}%`),
          ilike(organization.slug, `%${query}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(organization)
      .where(whereClause)
      .orderBy(desc(organization.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ total: count() })
      .from(organization)
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(id: string): Promise<DbOrganization | undefined> {
    const [result] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);
    
    return result;
  },

  async findBySlug(slug: string): Promise<DbOrganization | undefined> {
    const [result] = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    
    return result;
  },

  async create(data: NewDbOrganization) {
    const [newOrg] = await db.insert(organization).values(data).returning();
    return newOrg;
  },

  async update(id: string, data: Partial<NewDbOrganization>) {
    const [updatedOrg] = await db
      .update(organization)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organization.id, id))
      .returning();
    return updatedOrg;
  },

  async delete(id: string) {
    await db.delete(organization).where(eq(organization.id, id));
  }
};
