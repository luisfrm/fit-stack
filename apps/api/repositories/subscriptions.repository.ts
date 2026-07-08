import { db, eq, desc, and, sql, or, count, ilike, gte, lte } from '@workspace/database/client'
import { subscription, gymMember as members, membershipPlan, payment } from '@workspace/database/schema'
import { SubscriptionStatus, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES } from '@workspace/shared'
import { OrganizationDateManager } from '../lib/date-manager'

export interface ISubscriptionDTO {
  id?: number
  organizationId: string
  memberId: number
  planId: number
  startDate: Date
  endDate: Date
  status?: SubscriptionStatus
  cancelledAt?: Date | null
  isActive?: boolean
  createdAt?: Date
}

export interface SubscriptionsFilter {
  organizationId: string;
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedSubscriptionsResult {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const subscriptionsRepository = {
  // Helpers para evitar repetición de lógica
  getSubscriptionStatusSql(now: Date) {
    return sql<SubscriptionStatus>`CASE 
      WHEN ${subscription.cancelledAt} IS NOT NULL THEN ${SUBSCRIPTION_STATUSES.CANCELLED}
      WHEN ${payment.status} IN (${PAYMENT_STATUSES.VOIDED}, ${PAYMENT_STATUSES.INVALID}) THEN ${SUBSCRIPTION_STATUSES.CANCELLED}
      WHEN ${subscription.endDate} < ${now} THEN ${SUBSCRIPTION_STATUSES.EXPIRED}
      ELSE ${SUBSCRIPTION_STATUSES.ACTIVE}
    END`;
  },

  getSubscriptionIsActiveSql(now: Date) {
    return sql<boolean>`${subscription.endDate} >= ${now} 
      AND ${subscription.cancelledAt} IS NULL 
      AND ${payment.status} NOT IN (${PAYMENT_STATUSES.VOIDED}, ${PAYMENT_STATUSES.INVALID})`;
  },

  getPaidAndNotRevokedCondition() {
    return and(
      sql`${subscription.cancelledAt} IS NULL`,
      sql`${payment.status} NOT IN (${PAYMENT_STATUSES.VOIDED}, ${PAYMENT_STATUSES.INVALID})`
    );
  },

  async findAllPaginated(filters: SubscriptionsFilter, now: Date = new Date()): Promise<PaginatedSubscriptionsResult> {
    const { organizationId, query, status, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(subscription.organizationId, organizationId)];

    if (query) {
      conditions.push(
        or(
          ilike(members.firstName, `%${query}%`),
          ilike(members.lastName, `%${query}%`),
          ilike(members.email, `%${query}%`),
          ilike(members.documentId, `%${query}%`),
          ilike(membershipPlan.name, `%${query}%`)
        )!
      );
    }

    if (status) {
      if (status === "processing") {
        conditions.push(eq(payment.status, "processing"));
      } else if (status === SUBSCRIPTION_STATUSES.ACTIVE) {
        conditions.push(
          and(
            gte(subscription.endDate, now),
            this.getPaidAndNotRevokedCondition()
          )!
        );
      } else if (status === SUBSCRIPTION_STATUSES.EXPIRING) {
        const limitDate = new Date(now);
        limitDate.setDate(now.getDate() + 7);
        conditions.push(
          and(
            gte(subscription.endDate, now),
            lte(subscription.endDate, limitDate),
            this.getPaidAndNotRevokedCondition()
          )!
        );
      } else if (status === PAYMENT_STATUSES.VOIDED) {
        conditions.push(eq(payment.status, PAYMENT_STATUSES.VOIDED));
      }
    }

    const whereClause = and(...conditions);

    const rows = await db
      .select({
        id: subscription.id,
        memberId: subscription.memberId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        cancelledAt: subscription.cancelledAt,
        status: this.getSubscriptionStatusSql(now).as('status'),
        isActive: this.getSubscriptionIsActiveSql(now),
        memberName: members.firstName,
        memberLastName: members.lastName,
        memberEmail: members.email,
        memberImage: members.imageUrl,
        memberDocumentId: members.documentId,
        memberAddress: members.address,
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
      .where(whereClause)
      .orderBy(desc(payment.id), desc(subscription.id))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ total: count() })
      .from(subscription)
      .innerJoin(members, eq(subscription.memberId, members.id))
      .innerJoin(membershipPlan, eq(subscription.planId, membershipPlan.id))
      .leftJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findAllVisible(organizationId: string, now: Date = new Date()) {
    return db
      .select({
        id: subscription.id,
        memberId: subscription.memberId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        cancelledAt: subscription.cancelledAt,
        status: this.getSubscriptionStatusSql(now).as('status'),
        isActive: this.getSubscriptionIsActiveSql(now),
        memberName: members.firstName,
        memberLastName: members.lastName,
        memberEmail: members.email,
        memberImage: members.imageUrl,
        memberDocumentId: members.documentId,
        memberAddress: members.address,
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
        memberImageUrl: members.imageUrl,
        planName: membershipPlan.name,
        amountPaid: payment.amountPaid,
        currencyPaid: payment.currencyPaid,
        endDate: subscription.endDate,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .innerJoin(members, eq(subscription.memberId, members.id))
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .leftJoin(membershipPlan, eq(subscription.planId, membershipPlan.id))
      .where(and(
        eq(subscription.organizationId, organizationId),
        or(
          eq(payment.status, 'validated'),
          eq(payment.status, 'processing')
        )
      ))
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
  },

  async findLatestForMember(organizationId: string, memberId: number, now: Date = new Date()) {
    const results = await db
      .select({
        id: subscription.id,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        cancelledAt: subscription.cancelledAt,
        planName: membershipPlan.name,
        paymentStatus: payment.status,
        status: sql<SubscriptionStatus>`CASE 
          WHEN ${subscription.cancelledAt} IS NOT NULL THEN 'cancelled'
          WHEN ${subscription.endDate} < ${now} THEN 'expired'
          ELSE 'active'
        END`.as('status'),
      })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .leftJoin(membershipPlan, eq(subscription.planId, membershipPlan.id))
      .where(and(
        eq(subscription.memberId, memberId),
        eq(subscription.organizationId, organizationId),
        sql`${subscription.cancelledAt} IS NULL`,
        or(
          eq(payment.status, 'validated'),
          eq(payment.status, 'processing')
        )
      ))
      .orderBy(desc(subscription.endDate))
      .limit(1);

    return results[0] || null;
  },

  async getExpiringSoonCount(organizationId: string, now: Date, days: number = 7) {
    const limitDate = new Date(now);
    limitDate.setDate(limitDate.getDate() + days);

    const result = await db
      .select({ count: sql<number>`count(distinct ${subscription.memberId})` })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        sql`${subscription.cancelledAt} IS NULL`,
        eq(payment.status, 'validated'),
        gte(subscription.endDate, now),
        lte(subscription.endDate, limitDate)
      ));
    return result[0]?.count || 0;
  },

  async getActiveCount(organizationId: string, now: Date) {
    const result = await db
      .select({ count: sql<number>`count(distinct ${subscription.memberId})` })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        sql`${subscription.cancelledAt} IS NULL`,
        gte(subscription.endDate, now),
        eq(payment.status, 'validated')
      ));
    return result[0]?.count || 0;
  },

  async getActiveCountByPlan(organizationId: string, now: Date) {
    const result = await db
      .select({
        planName: payment.planSnapshotName,
        count: sql<number>`count(distinct ${subscription.memberId})`.mapWith(Number)
      })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        sql`${subscription.cancelledAt} IS NULL`,
        gte(subscription.endDate, now),
        eq(payment.status, 'validated')
      ))
      .groupBy(payment.planSnapshotName)
      .orderBy(desc(sql`count`));
    
    return result;
  },

  async getRenewalsProjection(organizationId: string, startDate: Date, endDate: Date, dateManager: OrganizationDateManager) {
    return db
      .select({
        day: dateManager.formatDaySql(subscription.endDate),
        count: sql<number>`count(distinct ${subscription.memberId})`.mapWith(Number)
      })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        sql`${subscription.cancelledAt} IS NULL`,
        gte(subscription.endDate, startDate),
        lte(subscription.endDate, endDate),
        eq(payment.status, 'validated')
      ))
      .groupBy(sql`1`)
      .orderBy(sql`1`);
  },

  async getNetGrowth(organizationId: string, startDate: Date, now: Date, dateManager: OrganizationDateManager) {
    const altas = await db
      .select({
        day: dateManager.formatDaySql(subscription.startDate),
        count: sql<number>`count(distinct ${subscription.memberId})`.mapWith(Number)
      })
      .from(subscription)
      .where(and(
        eq(subscription.organizationId, organizationId),
        gte(subscription.startDate, startDate),
        lte(subscription.startDate, now)
      ))
      .groupBy(sql`1`);

    const bajas = await db
      .select({
        day: dateManager.formatDaySql(sql`COALESCE(${subscription.cancelledAt}, ${subscription.endDate})`),
        count: sql<number>`count(distinct ${subscription.memberId})`.mapWith(Number)
      })
      .from(subscription)
      .where(and(
        eq(subscription.organizationId, organizationId),
        or(
          and(
            sql`${subscription.cancelledAt} IS NOT NULL`,
            gte(subscription.cancelledAt, startDate),
            lte(subscription.cancelledAt, now)
          ),
          and(
            sql`${subscription.cancelledAt} IS NULL`,
            sql`${subscription.endDate} < ${now}`,
            gte(subscription.endDate, startDate)
          )
        )
      ))
      .groupBy(sql`1`);

    return { altas, bajas };
  }
}
