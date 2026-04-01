import { db, eq, desc } from '@workspace/database/client'
import { subscriptions, members, membershipPlans } from '@workspace/database/schema'

export interface ISubscriptionDTO {
  id?: number
  memberId: number
  planId: number
  startDate: Date
  endDate: Date
  status: 'active' | 'cancelled' | 'expired'
  createdAt?: Date
}

export const subscriptionsRepository = {
  async findAllVisible() {
    return db
      .select({
        id: subscriptions.id,
        memberId: subscriptions.memberId,
        planId: subscriptions.planId,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        status: subscriptions.status,
        memberName: members.firstName,
        memberLastName: members.lastName,
        planName: membershipPlans.name,
        price: membershipPlans.price
      })
      .from(subscriptions)
      .innerJoin(members, eq(subscriptions.memberId, members.id))
      .innerJoin(membershipPlans, eq(subscriptions.planId, membershipPlans.id))
      .orderBy(desc(subscriptions.id))
  },

  async findRecent(limit: number) {
    return db
      .select({
        id: subscriptions.id,
        memberName: members.firstName,
        memberLastName: members.lastName,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(members, eq(subscriptions.memberId, members.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
  },

  async create(data: Omit<ISubscriptionDTO, 'id'>) {
    const inserted = await db.insert(subscriptions).values({
      memberId: data.memberId,
      planId: data.planId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      createdAt: data.createdAt ?? new Date(),
    }).returning()
    return inserted[0]
  },

  async updateStatus(id: number, status: 'active' | 'cancelled' | 'expired') {
    const updated = await db
      .update(subscriptions)
      .set({ status })
      .where(eq(subscriptions.id, id))
      .returning()
    return updated[0]
  },

  async delete(id: number) {
    await db.delete(subscriptions).where(eq(subscriptions.id, id))
  }
}
