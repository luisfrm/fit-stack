import { db, eq, sql, getTableColumns, sum, gte, and } from '@workspace/database/client'
import { membershipPlan, subscription, payment } from '@workspace/database/schema'

export interface IMembershipPlan {
  id?: number
  organizationId: string
  name: string
  price: string | number // decimal in pg is string in drizzle
  currency: string
  durationValue: number
  durationUnit: 'day' | 'week' | 'month' | 'year'
  features: string[] | null
  isPopular: boolean
  isActive: boolean
  isVisibleOnSite: boolean
  createdAt?: string | Date
  activeMembersCount?: number
}

export interface IMembershipsSummary {
  totalActivesubscription: number
  monthlyRevenue: Record<string, number>
}

export const plansRepository = {
  async findAll(organizationId: string, filters: { includeStats?: boolean } = {}, now: Date = new Date()): Promise<IMembershipPlan[]> {
    if (filters?.includeStats) {
      const records = await db
        .select({
          ...getTableColumns(membershipPlan),
          activeMembersCount: sql<number>`count(${subscription.id})`.mapWith(Number)
        })
        .from(membershipPlan)
        .leftJoin(subscription, and(
          eq(membershipPlan.id, subscription.planId),
          gte(subscription.endDate, now)
        ))
        .where(eq(membershipPlan.organizationId, organizationId))
        .groupBy(membershipPlan.id)
        .orderBy(membershipPlan.id)
      return records as unknown as IMembershipPlan[]
    }

    const records = await db.select().from(membershipPlan)
      .where(eq(membershipPlan.organizationId, organizationId))
      .orderBy(membershipPlan.id)
    return records as unknown as IMembershipPlan[]
  },

  async getSummary(organizationId: string, now: Date = new Date(), timezone: string = 'UTC'): Promise<IMembershipsSummary> {
    // 1. Monthly Revenue (Using PostgreSQL AT TIME ZONE for correct month truncation)
    const incomeResults = await db
      .select({ 
        currency: payment.currencyPaid, 
        total: sum(payment.amountPaid) 
      })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId), 
        eq(payment.status, 'validated'),
        // Filter payments where the date truncated to month in local time matches current local month
        sql`DATE_TRUNC('month', ${payment.paymentDate} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) = DATE_TRUNC('month', ${now} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})`
      ))
      .groupBy(payment.currencyPaid)

    const monthlyRevenue: Record<string, number> = {}
    incomeResults.forEach(row => {
      if (row.currency) {
        monthlyRevenue[row.currency] = Number(row.total ?? 0)
      }
    })

    // 2. Total Active subscription (Using actual UTC 'now' for expiration check)
    const activeSubsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(subscription)
      .where(and(
        eq(subscription.organizationId, organizationId), 
        gte(subscription.endDate, now),
        sql`${subscription.cancelledAt} IS NULL`
      ))

    return {
      totalActivesubscription: activeSubsResult[0]?.count ?? 0,
      monthlyRevenue
    }
  },

  async findById(organizationId: string, id: number): Promise<IMembershipPlan | undefined> {
    const records = await db.select().from(membershipPlan)
      .where(and(eq(membershipPlan.id, id), eq(membershipPlan.organizationId, organizationId)))
    return records[0] as unknown as IMembershipPlan | undefined
  },

  async create(organizationId: string, data: Omit<IMembershipPlan, 'id' | 'organizationId'>): Promise<IMembershipPlan> {
    const inserted = await db.insert(membershipPlan).values({
      organizationId,
      name: data.name,
      price: data.price.toString(),
      currency: data.currency,
      durationValue: data.durationValue,
      durationUnit: data.durationUnit,
      features: data.features,
      isPopular: data.isPopular,
      isActive: data.isActive,
      isVisibleOnSite: data.isVisibleOnSite,
    }).returning()
    return inserted[0] as unknown as IMembershipPlan
  },

  async update(organizationId: string, id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
    const updated = await db
      .update(membershipPlan)
      .set({
        name: data.name,
        price: data.price?.toString(),
        currency: data.currency,
        durationValue: data.durationValue,
        durationUnit: data.durationUnit as any, // Cast because of Drizzle enum type
        features: data.features,
        isPopular: data.isPopular,
        isActive: data.isActive,
        isVisibleOnSite: data.isVisibleOnSite,
      })
      .where(and(eq(membershipPlan.id, id), eq(membershipPlan.organizationId, organizationId)))
      .returning()
    return updated[0] as unknown as IMembershipPlan
  },

  async delete(organizationId: string, id: number): Promise<void> {
    await db.delete(membershipPlan).where(and(eq(membershipPlan.id, id), eq(membershipPlan.organizationId, organizationId)))
  }
}
