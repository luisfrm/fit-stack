import { eq, ilike, and, or, sql, count, asc, type Db } from '@workspace/database/factory';
import { gymClass } from '@workspace/database/schema';

export type GymClass = typeof gymClass.$inferSelect;
export type NewGymClass = typeof gymClass.$inferInsert;

export interface ClassesFilter {
  name?: string;
  trainerName?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface PaginatedClasses {
  data: GymClass[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function createClassesRepository(db: Db) {
  return {
    async findAll(organizationId: string, filters: ClassesFilter = {}): Promise<PaginatedClasses> {
      const { name, trainerName, isVisible, page = 1, limit = 10, requireTotal = false } = filters;
      const offset = (page - 1) * limit;

      const conditions = [eq(gymClass.organizationId, organizationId)];
      if (name) conditions.push(ilike(gymClass.name, `%${name}%`));
      if (trainerName) conditions.push(ilike(gymClass.trainerName, `%${trainerName}%`));
      if (isVisible !== undefined) conditions.push(eq(gymClass.isVisible, isVisible));

      const where = and(...conditions);

      const rowsQuery = db.select().from(gymClass).where(where).orderBy(gymClass.id).limit(limit).offset(offset);

      if (!requireTotal) {
        const rows = await rowsQuery;
        return { data: rows, total: -1, page, limit, totalPages: -1 };
      }

      const [rows, countResult] = await Promise.all([
        rowsQuery,
        db.select({ total: count() }).from(gymClass).where(where),
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

    async findByDate(organizationId: string, date: string): Promise<GymClass[]> {
      const [year, month, day] = date.split('-').map(Number);
      const dateObj = new Date(year!, month! - 1, day!);
      const dayOfWeek = dateObj.getDay();

      return db
        .select()
        .from(gymClass)
        .where(
          and(
            eq(gymClass.organizationId, organizationId),
            eq(gymClass.isVisible, true),
            or(
              and(
                eq(gymClass.frequencyType, 'once'),
                eq(gymClass.scheduledDate, date)
              ),
              and(
                eq(gymClass.frequencyType, 'weekly'),
                sql`${dayOfWeek} = ANY(${gymClass.daysOfWeek})`
              )
            )
          )
        )
        .orderBy(asc(gymClass.startTime));
    },

    async findById(organizationId: string, id: number) {
      const [result] = await db.select().from(gymClass).where(and(eq(gymClass.id, id), eq(gymClass.organizationId, organizationId)));
      return result;
    },

    async create(organizationId: string, data: Omit<NewGymClass, 'organizationId'>) {
      const [newClass] = await db.insert(gymClass).values({ ...data, organizationId }).returning();
      return newClass;
    },

    async update(organizationId: string, id: number, data: Partial<Omit<NewGymClass, 'organizationId'>>) {
      const [updatedClass] = await db
        .update(gymClass)
        .set(data)
        .where(and(eq(gymClass.id, id), eq(gymClass.organizationId, organizationId)))
        .returning();
      return updatedClass;
    },

    async delete(organizationId: string, id: number) {
      await db.delete(gymClass).where(and(eq(gymClass.id, id), eq(gymClass.organizationId, organizationId)));
    },
  };
}

export type ClassesRepository = ReturnType<typeof createClassesRepository>;
