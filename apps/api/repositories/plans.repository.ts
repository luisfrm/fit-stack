import { db, eq, sql, getTableColumns, sum, gte, and } from '@workspace/database/client'
import { membershipPlans, subscriptions, payments } from '@workspace/database/schema'

export interface IMembershipPlan {
  id?: number
  name: string
  price: number
  currency: 'USD' | 'VES' | 'EUR'
  features: string[] | null
  isPopular: boolean
  isActive: boolean
  isVisibleOnSite: boolean
  createdAt?: Date
  activeMembersCount?: number
}

export interface IMembershipsSummary {
  totalActiveSubscriptions: number
  monthlyRevenue: Record<string, number>
}

export const plansRepository = {
  async findAll(filters: { includeStats?: boolean } = {}, now: Date = new Date()): Promise<IMembershipPlan[]> {
    if (filters?.includeStats) {
      const records = await db
        .select({
          ...getTableColumns(membershipPlans),
          activeMembersCount: sql<number>`count(${subscriptions.id})`.mapWith(Number)
        })
        .from(membershipPlans)
        .leftJoin(subscriptions, and(
          eq(membershipPlans.id, subscriptions.planId),
          gte(subscriptions.endDate, now)
        ))
        .groupBy(membershipPlans.id)
        .orderBy(membershipPlans.id)
      return records as unknown as IMembershipPlan[]
    }

    const records = await db.select().from(membershipPlans).orderBy(membershipPlans.id)
    return records as unknown as IMembershipPlan[]
  },

  async getSummary(now: Date = new Date()): Promise<IMembershipsSummary> {
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // 1. Monthly Revenue (Reusing logic from dashboard)
    const incomeResults = await db
      .select({ 
        currency: payments.currencyPaid, 
        total: sum(payments.amountPaid) 
      })
      .from(payments)
      .where(gte(payments.paymentDate, firstDayOfMonth))
      .groupBy(payments.currencyPaid)

    const monthlyRevenue: Record<string, number> = {
      USD: 0,
      VES: 0,
      EUR: 0
    }
    incomeResults.forEach(row => {
      if (row.currency) {
        monthlyRevenue[row.currency] = Number(row.total ?? 0)
      }
    })

    // 2. Total Active Subscriptions (Using same 'active' logic as dashboard)
    const activeSubsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(subscriptions)
      .where(gte(subscriptions.endDate, now))

    return {
      totalActiveSubscriptions: activeSubsResult[0]?.count ?? 0,
      monthlyRevenue
    }
  },

  async findById(id: number): Promise<IMembershipPlan | undefined> {
    const records = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id))
    return records[0] as IMembershipPlan | undefined
  },

  async create(data: Omit<IMembershipPlan, 'id'>): Promise<IMembershipPlan> {
    const inserted = await db.insert(membershipPlans).values({
      name: data.name,
      price: data.price,
      currency: data.currency,
      features: data.features,
      isPopular: data.isPopular,
      isActive: data.isActive,
      isVisibleOnSite: data.isVisibleOnSite,
    }).returning()
    return inserted[0] as IMembershipPlan
  },

  async update(id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
    const updated = await db
      .update(membershipPlans)
      .set({
        name: data.name,
        price: data.price,
        currency: data.currency,
        features: data.features,
        isPopular: data.isPopular,
        isActive: data.isActive,
        isVisibleOnSite: data.isVisibleOnSite,
      })
      .where(eq(membershipPlans.id, id))
      .returning()
    return updated[0] as IMembershipPlan
  },

  async delete(id: number): Promise<void> {
    await db.delete(membershipPlans).where(eq(membershipPlans.id, id))
  }
}
