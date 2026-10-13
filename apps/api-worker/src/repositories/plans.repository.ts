import { eq, sql, getTableColumns, sum, gte, and, isNull, type Db } from '@workspace/database/factory';
import { membershipPlan, subscription, payment } from '@workspace/database/schema';
import { OrganizationDateManager } from '../lib/date-manager';

export interface IMembershipPlan {
  id?: number;
  organizationId: string;
  name: string;
  /** Precio en centavos enteros. */
  price: number;
  currency: string;
  durationValue: number;
  durationUnit: 'day' | 'week' | 'month' | 'year';
  features: string[] | null;
  isPopular: boolean;
  isActive: boolean;
  isVisibleOnSite: boolean;
  deletedAt?: Date | null;
  createdAt?: string | Date;
  activeMembersCount?: number;
}

export interface IMembershipsSummary {
  totalActivesubscription: number;
  monthlyRevenue: Record<string, number>;
}

export function createPlansRepository(db: Db) {
  return {
    async findAll(organizationId: string, filters: { includeStats?: boolean } = {}, now: Date = new Date()): Promise<IMembershipPlan[]> {
      if (filters?.includeStats) {
        const records = await db
          .select({
            ...getTableColumns(membershipPlan),
            activeMembersCount: sql<number>`count(${subscription.id})`.mapWith(Number),
          })
          .from(membershipPlan)
          .leftJoin(
            subscription,
            and(
              eq(membershipPlan.id, subscription.planId),
              gte(subscription.endDate, now)
            )
          )
          .where(and(eq(membershipPlan.organizationId, organizationId), isNull(membershipPlan.deletedAt)))
          .groupBy(membershipPlan.id)
          .orderBy(membershipPlan.id);

        return records as unknown as IMembershipPlan[];
      }

      const records = await db
        .select()
        .from(membershipPlan)
        .where(and(eq(membershipPlan.organizationId, organizationId), isNull(membershipPlan.deletedAt)))
        .orderBy(membershipPlan.id);
      return records as unknown as IMembershipPlan[];
    },

    async getSummary(organizationId: string, dateManager: OrganizationDateManager, now: Date = new Date()): Promise<IMembershipsSummary> {
      const incomeResults = await db
        .select({
          currency: payment.currencyPaid,
          total: sum(payment.amountPaid),
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            sql`DATE_TRUNC('month', ${dateManager.toLocalSql(payment.paymentDate)}) = DATE_TRUNC('month', ${dateManager.toLocalValueSql(now)})`
          )
        )
        .groupBy(payment.currencyPaid);

      const monthlyRevenue: Record<string, number> = {};
      incomeResults.forEach((row) => {
        if (row.currency) {
          monthlyRevenue[row.currency] = Number(row.total ?? 0);
        }
      });

      const activeSubsResult = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(subscription)
        .where(
          and(
            eq(subscription.organizationId, organizationId),
            gte(subscription.endDate, now),
            sql`${subscription.cancelledAt} IS NULL`
          )
        );

      return {
        totalActivesubscription: activeSubsResult[0]?.count ?? 0,
        monthlyRevenue,
      };
    },

    async findById(
      organizationId: string,
      id: number,
      options: { includeDeleted?: boolean } = {}
    ): Promise<IMembershipPlan | undefined> {
      const conditions = [eq(membershipPlan.id, id), eq(membershipPlan.organizationId, organizationId)];
      if (!options.includeDeleted) {
        conditions.push(isNull(membershipPlan.deletedAt));
      }
      const records = await db
        .select()
        .from(membershipPlan)
        .where(and(...conditions));
      return records[0] as unknown as IMembershipPlan | undefined;
    },

    async create(organizationId: string, data: Omit<IMembershipPlan, 'id' | 'organizationId'>): Promise<IMembershipPlan> {
      const inserted = await db
        .insert(membershipPlan)
        .values({
          organizationId,
          name: data.name,
          price: data.price,
          currency: data.currency,
          durationValue: data.durationValue,
          durationUnit: data.durationUnit,
          features: data.features,
          isPopular: data.isPopular,
          isActive: data.isActive,
          isVisibleOnSite: data.isVisibleOnSite,
        })
        .returning();
      return inserted[0] as unknown as IMembershipPlan;
    },

    async update(organizationId: string, id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
      const updated = await db
        .update(membershipPlan)
        .set({
          name: data.name,
          price: data.price,
          currency: data.currency,
          durationValue: data.durationValue,
          durationUnit: data.durationUnit as any,
          features: data.features,
          isPopular: data.isPopular,
          isActive: data.isActive,
          isVisibleOnSite: data.isVisibleOnSite,
        })
        .where(
          and(
            eq(membershipPlan.id, id),
            eq(membershipPlan.organizationId, organizationId),
            // A soft-deleted plan is immutable (RD-142): the row is kept as
            // history only, so it can never be edited nor resurrected. The
            // route already 404s it via `findById`, this is defence in depth.
            isNull(membershipPlan.deletedAt)
          )
        )
        .returning();
      return updated[0] as unknown as IMembershipPlan;
    },

    /**
     * Soft delete: a single UPDATE statement (no interactive transactions).
     * `RETURNING` lets the service confirm the row was actually flagged.
     * Idempotent: a second call matches no row (`deleted_at IS NULL` guard).
     */
    async softDelete(organizationId: string, id: number) {
      const [updated] = await db
        .update(membershipPlan)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(membershipPlan.id, id),
            eq(membershipPlan.organizationId, organizationId),
            isNull(membershipPlan.deletedAt)
          )
        )
        .returning();
      return updated;
    },
  };
}

export type PlansRepository = ReturnType<typeof createPlansRepository>;
