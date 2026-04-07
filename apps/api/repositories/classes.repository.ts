import { eq, ilike, and, or, sql, db, count, asc } from '@workspace/database/client';
import { cmsClass } from '@workspace/database/schema';

// Types inferred from schema
export type CmsClass = typeof cmsClass.$inferSelect;
export type NewCmsClass = typeof cmsClass.$inferInsert;

export interface ClassesFilter {
  name?: string;
  trainerName?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  /** When true, executes an extra COUNT query to return total and totalPages. Default: false */
  requireTotal?: boolean;
}

export interface PaginatedClasses {
  data: CmsClass[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const classesRepository = {
  /**
   * Returns all classes with optional filters and pagination (CMS listing).
   */
  async findAll(organizationId: string, filters: ClassesFilter = {}): Promise<PaginatedClasses> {
    const { name, trainerName, isVisible, page = 1, limit = 10, requireTotal = false } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(cmsClass.organizationId, organizationId)];
    if (name) conditions.push(ilike(cmsClass.name, `%${name}%`));
    if (trainerName) conditions.push(ilike(cmsClass.trainerName, `%${trainerName}%`));
    if (isVisible !== undefined) conditions.push(eq(cmsClass.isVisible, isVisible));

    const where = and(...conditions);

    const rowsQuery = db.select().from(cmsClass).where(where).orderBy(cmsClass.id).limit(limit).offset(offset);

    if (!requireTotal) {
      const rows = await rowsQuery;
      return { data: rows, total: -1, page, limit, totalPages: -1 };
    }

    const [rows, countResult] = await Promise.all([
      rowsQuery,
      db.select({ total: count() }).from(cmsClass).where(where),
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

  /**
   * Returns classes scheduled for a specific date.
   */
  async findByDate(organizationId: string, date: string): Promise<CmsClass[]> {
    // Parse "YYYY-MM-DD" safely to avoid timezone shifts
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year!, month! - 1, day!);
    const dayOfWeek = dateObj.getDay(); // 0=Sunday...6=Saturday

    return db
      .select()
      .from(cmsClass)
      .where(
        and(
          eq(cmsClass.organizationId, organizationId),
          eq(cmsClass.isVisible, true),
          or(
            // Clase puntual: fecha exacta
            and(
              eq(cmsClass.frequencyType, 'once'),
              eq(cmsClass.scheduledDate, date)
            ),
            // Clase semanal: el día de semana está en el array daysOfWeek
            and(
              eq(cmsClass.frequencyType, 'weekly'),
              sql`${dayOfWeek} = ANY(${cmsClass.daysOfWeek})`
            )
          )
        )
      )
      .orderBy(asc(cmsClass.startTime));
  },

  async findById(organizationId: string, id: number) {
    const [result] = await db.select().from(cmsClass).where(and(eq(cmsClass.id, id), eq(cmsClass.organizationId, organizationId)));
    return result;
  },

  async create(organizationId: string, data: Omit<NewCmsClass, 'organizationId'>) {
    const [newClass] = await db.insert(cmsClass).values({ ...data, organizationId }).returning();
    return newClass;
  },

  async update(organizationId: string, id: number, data: Partial<Omit<NewCmsClass, 'organizationId'>>) {
    const [updatedClass] = await db
      .update(cmsClass)
      .set(data)
      .where(and(eq(cmsClass.id, id), eq(cmsClass.organizationId, organizationId)))
      .returning();
    return updatedClass;
  },

  async delete(organizationId: string, id: number) {
    await db.delete(cmsClass).where(and(eq(cmsClass.id, id), eq(cmsClass.organizationId, organizationId)));
  }
};
