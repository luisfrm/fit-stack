import {
  eq,
  sql,
  desc,
  count,
  getTableColumns,
  type Db,
} from '@workspace/database/factory';
import {
  platformPlan,
  platformSubscription,
  platformSubscriptionPayment,
} from '@workspace/database/schema';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';

export type DbPlatformPlan = typeof platformPlan.$inferSelect;
export type NewDbPlatformPlan = typeof platformPlan.$inferInsert;

export interface PlatformPlanWithStats extends DbPlatformPlan {
  organizationCount: number;
}

export interface PlatformPlansSummary {
  totalPlans: number;
  activePlans: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  monthlyRevenue: Record<string, number>;
  trialPlans: number;
}

export function createPlatformPlansRepository(db: Db) {
  return {
    async findAll() {
      return db.select().from(platformPlan).where(eq(platformPlan.isActive, true));
    },

    async findAllWithStats(): Promise<PlatformPlanWithStats[]> {
      const plans = await db
        .select({
          ...getTableColumns(platformPlan),
          organizationCount: sql<number>`count(DISTINCT ${platformSubscription.organizationId})::int`,
        })
        .from(platformPlan)
        .leftJoin(platformSubscription, eq(platformPlan.id, platformSubscription.planId))
        .where(eq(platformPlan.isActive, true))
        .groupBy(platformPlan.id)
        .orderBy(desc(platformPlan.createdAt));

      return plans as unknown as PlatformPlanWithStats[];
    },

    async findById(id: number): Promise<DbPlatformPlan | undefined> {
      const [result] = await db
        .select()
        .from(platformPlan)
        .where(eq(platformPlan.id, id))
        .limit(1);
      return result;
    },

    async create(data: NewDbPlatformPlan) {
      const [newPlan] = await db.insert(platformPlan).values(data).returning();
      return newPlan;
    },

    async update(id: number, data: Partial<NewDbPlatformPlan>) {
      const [updatedPlan] = await db
        .update(platformPlan)
        .set(data)
        .where(eq(platformPlan.id, id))
        .returning();
      return updatedPlan;
    },

    async delete(id: number) {
      await db.update(platformPlan).set({ isActive: false }).where(eq(platformPlan.id, id));
    },

    async getSummary(): Promise<PlatformPlansSummary> {
      const [plansResult] = await db.select({ count: count() }).from(platformPlan);
      const [activePlansResult] = await db
        .select({ count: count() })
        .from(platformPlan)
        .where(eq(platformPlan.isActive, true));
      const [subscriptionsResult] = await db
        .select({ count: count() })
        .from(platformSubscription);

      // Active: currentPeriodEnd >= now AND cancelledAt IS NULL
      const [activeSubscriptionsResult] = await db
        .select({ count: count() })
        .from(platformSubscription)
        .where(
          sql`${platformSubscription.cancelledAt} IS NULL AND ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP`
        );

      const revenueResult = await db
        .select({
          currency: platformSubscriptionPayment.currencyPaid,
          total: sql<number>`sum(${platformSubscriptionPayment.amountPaid})::int`.mapWith(Number),
        })
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.status, PAYMENT_STATUSES.VALIDATED))
        .groupBy(platformSubscriptionPayment.currencyPaid);

      const monthlyRevenue: Record<string, number> = {};
      revenueResult.forEach((row) => {
        if (row.currency) {
          monthlyRevenue[row.currency] = Number(row.total ?? 0);
        }
      });

      const trialPlansResult = await db
        .select({ count: count() })
        .from(platformPlan)
        .where(sql`${platformPlan.trialDays} > 0`);

      return {
        totalPlans: Number(plansResult?.count ?? 0),
        activePlans: Number(activePlansResult?.count ?? 0),
        totalSubscriptions: Number(subscriptionsResult?.count ?? 0),
        activeSubscriptions: Number(activeSubscriptionsResult?.count ?? 0),
        monthlyRevenue,
        trialPlans: Number(trialPlansResult[0]?.count ?? 0),
      };
    },
  };
}

export type PlatformPlansRepository = ReturnType<typeof createPlatformPlansRepository>;
