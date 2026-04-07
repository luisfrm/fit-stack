import { db, eq, desc, and, sql } from '@workspace/database/client'
import { subscription, gymMember as members, membershipPlan } from '@workspace/database/schema'

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
        id: subscription.id,
        memberId: subscription.memberId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        isActive: sql<boolean>`${subscription.endDate} >= ${now}`,
        memberName: members.firstName,
        memberLastName: members.lastName,
        planName: membershipPlan.name,
        price: membershipPlan.price
      })
      .from(subscription)
      .innerJoin(members, eq(subscription.memberId, members.id))
      .innerJoin(membershipPlan, eq(subscription.planId, membershipPlan.id))
      .where(eq(subscription.organizationId, organizationId))
      .orderBy(desc(subscription.id))
  },

  async findRecent(organizationId: string, limit: number) {
    return db
      .select({
        id: subscription.id,
        memberName: members.firstName,
        memberLastName: members.lastName,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .innerJoin(members, eq(subscription.memberId, members.id))
      .where(eq(subscription.organizationId, organizationId))
      .orderBy(desc(subscription.createdAt))
      .limit(limit)
  },

  async create(organizationId: string, data: Omit<ISubscriptionDTO, 'id' | 'organizationId'>) {
    const inserted = await db.insert(subscription).values({
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
      .update(subscription)
      .set({ status })
      .where(and(eq(subscription.id, id), eq(subscription.organizationId, organizationId)))
      .returning()
    return updated[0]
  },

  async delete(organizationId: string, id: number) {
    await db.delete(subscription).where(and(eq(subscription.id, id), eq(subscription.organizationId, organizationId)))
  }
}
