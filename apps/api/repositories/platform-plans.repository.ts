import { eq, db, sql, desc, count, getTableColumns } from '@workspace/database/client';
import { fitstackPlan, storeSubscription, platformPayment } from '@workspace/database/schema';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';

export type DbPlatformPlan = typeof fitstackPlan.$inferSelect;
export type NewDbPlatformPlan = typeof fitstackPlan.$inferInsert;

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

export const platformPlansRepository = {
  async findAll() {
    return db.select().from(fitstackPlan).where(eq(fitstackPlan.isActive, true));
  },

  async findAllWithStats(): Promise<PlatformPlanWithStats[]> {
    const plans = await db
      .select({
        ...getTableColumns(fitstackPlan),
        organizationCount: sql<number>`count(${storeSubscription.organizationId})`.mapWith(Number)
      })
      .from(fitstackPlan)
      .leftJoin(
        storeSubscription,
        eq(fitstackPlan.id, storeSubscription.planId)
      )
      .where(eq(fitstackPlan.isActive, true))
      .groupBy(fitstackPlan.id)
      .orderBy(desc(fitstackPlan.createdAt));

    return plans as unknown as PlatformPlanWithStats[];
  },

  async findById(id: number): Promise<DbPlatformPlan | undefined> {
    const [result] = await db
      .select()
      .from(fitstackPlan)
      .where(eq(fitstackPlan.id, id))
      .limit(1);
    return result;
  },

  async create(data: NewDbPlatformPlan) {
    const [newPlan] = await db.insert(fitstackPlan).values(data).returning();
    return newPlan;
  },

  async update(id: number, data: Partial<NewDbPlatformPlan>) {
    const [updatedPlan] = await db
      .update(fitstackPlan)
      .set(data)
      .where(eq(fitstackPlan.id, id))
      .returning();
    return updatedPlan;
  },

  async delete(id: number) {
    await db.update(fitstackPlan).set({ isActive: false }).where(eq(fitstackPlan.id, id));
  },

  async getSummary(): Promise<PlatformPlansSummary> {
    const plansResult = await db
      .select({ count: count() })
      .from(fitstackPlan);

    const activePlansResult = await db
      .select({ count: count() })
      .from(fitstackPlan)
      .where(eq(fitstackPlan.isActive, true));

    const subscriptionsResult = await db
      .select({ count: count() })
      .from(storeSubscription);

    const activeSubscriptionsResult = await db
      .select({ count: count() })
      .from(storeSubscription)
      .where(eq(storeSubscription.status, 'active'));

    const revenueResult = await db
      .select({
        currency: platformPayment.currency,
        total: sql<number>`sum(${platformPayment.amount})`.mapWith(Number)
      })
      .from(platformPayment)
      .where(eq(platformPayment.status, PAYMENT_STATUSES.VALIDATED))
      .groupBy(platformPayment.currency);

    const monthlyRevenue: Record<string, number> = {};
    revenueResult.forEach(row => {
      if (row.currency) {
        monthlyRevenue[row.currency] = Number(row.total ?? 0);
      }
    });

    const hasTrialPlan = await db
      .select()
      .from(fitstackPlan)
      .where(sql`${fitstackPlan.price}::numeric = 0`)
      .limit(1);

    return {
      totalPlans: plansResult[0]?.count ?? 0,
      activePlans: activePlansResult[0]?.count ?? 0,
      totalSubscriptions: subscriptionsResult[0]?.count ?? 0,
      activeSubscriptions: activeSubscriptionsResult[0]?.count ?? 0,
      monthlyRevenue,
      trialPlans: hasTrialPlan.length > 0 ? 1 : 0,
    };
  }
};