import { db, eq, desc, and, sql } from '@workspace/database/client'
import { subscription, gymMember as members, membershipPlan, payment } from '@workspace/database/schema'

export interface ISubscriptionDTO {
  id?: number
  organizationId: string
  memberId: number
  planId: number
  startDate: Date
  endDate: Date
  status?: 'active' | 'cancelled' | 'expired'
  cancelledAt?: Date | null
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
        cancelledAt: subscription.cancelledAt,
        status: sql<'active' | 'cancelled' | 'expired'>`CASE 
          WHEN ${subscription.cancelledAt} IS NOT NULL THEN 'cancelled'
          WHEN ${subscription.endDate} < ${now} THEN 'expired'
          ELSE 'active'
        END`.as('status'),
        isActive: sql<boolean>`${subscription.endDate} >= ${now} AND ${subscription.cancelledAt} IS NULL`,
        memberName: members.firstName,
        memberLastName: members.lastName,
        memberImage: members.imageUrl,
        memberDocumentId: members.documentId,
        planName: membershipPlan.name,
        planSnapshotName: payment.planSnapshotName,
        planSnapshotPrice: payment.planSnapshotPrice,
        planSnapshotCurrency: payment.planSnapshotCurrency,
        // Payment joined fields
        paymentId: payment.id,
        amountPaid: payment.amountPaid,
        currencyPaid: payment.currencyPaid,
        paymentMethod: payment.paymentMethod,
        paymentMethodDetails: payment.paymentMethodDetails,
        exchangeRateApplied: payment.exchangeRateApplied,
        paymentStatus: payment.status,
        paymentDate: payment.paymentDate,
      })
      .from(subscription)
      .innerJoin(members, eq(subscription.memberId, members.id))
      .innerJoin(membershipPlan, eq(subscription.planId, membershipPlan.id))
      .leftJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(eq(subscription.organizationId, organizationId))
      .orderBy(desc(payment.id), desc(subscription.id))
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
      cancelledAt: data.cancelledAt ?? null,
      createdAt: data.createdAt ?? new Date(),
    }).returning()
    return inserted[0]
  },

  async cancel(organizationId: string, id: number) {
    const updated = await db
      .update(subscription)
      .set({ cancelledAt: new Date() })
      .where(and(eq(subscription.id, id), eq(subscription.organizationId, organizationId)))
      .returning()
    return updated[0]
  },

  async delete(organizationId: string, id: number) {
    await db.delete(subscription).where(and(eq(subscription.id, id), eq(subscription.organizationId, organizationId)))
  }
}
