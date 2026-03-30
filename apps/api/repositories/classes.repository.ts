import { eq, ilike, and, or, sql, db, count, asc } from '@workspace/database/client';
import { cmsClasses } from '@workspace/database/schema';

// Types inferred from schema
export type CmsClass = typeof cmsClasses.$inferSelect;
export type NewCmsClass = typeof cmsClasses.$inferInsert;

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
  async findAll(filters: ClassesFilter = {}): Promise<PaginatedClasses> {
    const { name, trainerName, isVisible, page = 1, limit = 10, requireTotal = false } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (name) conditions.push(ilike(cmsClasses.name, `%${name}%`));
    if (trainerName) conditions.push(ilike(cmsClasses.trainerName, `%${trainerName}%`));
    if (isVisible !== undefined) conditions.push(eq(cmsClasses.isVisible, isVisible));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rowsQuery = db.select().from(cmsClasses).where(where).orderBy(cmsClasses.id).limit(limit).offset(offset);

    if (!requireTotal) {
      const rows = await rowsQuery;
      return { data: rows, total: -1, page, limit, totalPages: -1 };
    }

    const [rows, countResult] = await Promise.all([
      rowsQuery,
      db.select({ total: count() }).from(cmsClasses).where(where),
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
   * Includes:
   *  - 'once' classes whose scheduledDate matches the date
   *  - 'weekly' classes whose daysOfWeek includes the day of week of the date
   *
   * Day of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
   */
  async findByDate(date: string): Promise<CmsClass[]> {
    // Parse "YYYY-MM-DD" safely to avoid timezone shifts
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year!, month! - 1, day!);
    const dayOfWeek = dateObj.getDay(); // 0=Sunday...6=Saturday

    return db
      .select()
      .from(cmsClasses)
      .where(
        and(
          eq(cmsClasses.isVisible, true),
          or(
            // Clase puntual: fecha exacta
            and(
              eq(cmsClasses.frequencyType, 'once'),
              eq(cmsClasses.scheduledDate, date)
            ),
            // Clase semanal: el día de semana está en el array daysOfWeek
            and(
              eq(cmsClasses.frequencyType, 'weekly'),
              sql`${dayOfWeek} = ANY(${cmsClasses.daysOfWeek})`
            )
          )
        )
      )
      .orderBy(asc(cmsClasses.startTime));
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
