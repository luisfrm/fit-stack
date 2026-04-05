import { db, eq, desc, and, sql } from '@workspace/database/client'
import { subscriptions, gymMembers as members, membershipPlans } from '@workspace/database/schema'

export interface ISubscriptionDTO {
  id?: number
  organizationId: string
  memberId: number
  planId: number
  startDate: Date
  endDate: Date
  status: 'active' | 'cancelled' | 'expired'
  isActive?: boolean
  createdAt?: Date
}

export const subscriptionsRepository = {
  async findAllVisible(organizationId: string, now: Date = new Date()) {
    return db
      .select({
        id: subscriptions.id,
        memberId: subscriptions.memberId,
        planId: subscriptions.planId,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        status: subscriptions.status,
        isActive: sql<boolean>`${subscriptions.endDate} >= ${now}`,
        memberName: members.firstName,
        memberLastName: members.lastName,
        planName: membershipPlans.name,
        price: membershipPlans.price
      })
      .from(subscriptions)
      .innerJoin(members, eq(subscriptions.memberId, members.id))
      .innerJoin(membershipPlans, eq(subscriptions.planId, membershipPlans.id))
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.id))
  },

  async findRecent(organizationId: string, limit: number) {
    return db
      .select({
        id: subscriptions.id,
        memberName: members.firstName,
        memberLastName: members.lastName,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(members, eq(subscriptions.memberId, members.id))
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
  },

  async create(organizationId: string, data: Omit<ISubscriptionDTO, 'id' | 'organizationId'>) {
    const inserted = await db.insert(subscriptions).values({
      organizationId,
      memberId: data.memberId,
      planId: data.planId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      createdAt: data.createdAt ?? new Date(),
    }).returning()
    return inserted[0]
  },

  async updateStatus(organizationId: string, id: number, status: 'active' | 'cancelled' | 'expired') {
    const updated = await db
      .update(subscriptions)
      .set({ status })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.organizationId, organizationId)))
      .returning()
    return updated[0]
  },

  async delete(organizationId: string, id: number) {
    await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.organizationId, organizationId)))
  }
}
