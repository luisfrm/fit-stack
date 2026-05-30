import { eq, desc, and, gte, lte, sql, count, inArray, db } from '@workspace/database/client';
import { storeSubscription, fitstackPlan, organization, platformPayment } from '@workspace/database/schema';
import { PLATFORM_SUBSCRIPTION_STATUSES, type PlatformSubscriptionStatus } from '@workspace/shared/constants';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';

export interface SubscriptionFilters {
  status?: PlatformSubscriptionStatus | 'all';
  planId?: number;
  organizationId?: string;
  isTrial?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SubscriptionWithDetails {
  id: number;
  organizationId: string;
  planId: number;
  status: string;
  computedStatus: PlatformSubscriptionStatus;
  startDate: Date;
  currentPeriodEnd: Date;
  isTrial: boolean;
  priceOverride: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  organizationName: string;
  organizationSlug: string | null;
  planName: string;
  planPrice: string;
  planCurrency: string;
}

export interface PaginatedSubscriptions {
  data: SubscriptionWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const platformSubscriptionsRepository = {
  /**
   * Computes the dynamic status based on currentPeriodEnd and payment void.
   * Uses SQL CASE for database-level computation.
   */
  getSubscriptionStatusSql() {
    const latestInvoiceStatus = sql`(SELECT status FROM platform_payment 
      WHERE plan_id = ${fitstackPlan.id} 
      AND organization_id = ${storeSubscription.organizationId}
      ORDER BY created_at DESC LIMIT 1)`;

    return sql<PlatformSubscriptionStatus>`CASE 
      WHEN ${storeSubscription.cancelledAt} IS NOT NULL THEN ${PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED}
      WHEN ${latestInvoiceStatus} = ${PAYMENT_STATUSES.VOIDED} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED}
      WHEN ${storeSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE}
      WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${storeSubscription.currentPeriodEnd})) / 86400 <= 7 THEN ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE}
      WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${storeSubscription.currentPeriodEnd})) / 86400 <= 14 THEN ${PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY}
      ELSE ${PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED}
    END`;
  },

  async findAll(filters: SubscriptionFilters = {}): Promise<PaginatedSubscriptions> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    // Base conditions (exclude 'cancelled' from computed status filter unless explicitly requested)
    const conditions: any[] = [];

    if (filters.organizationId) {
      conditions.push(eq(storeSubscription.organizationId, filters.organizationId));
    }

    if (filters.planId) {
      conditions.push(eq(storeSubscription.planId, filters.planId));
    }

    if (filters.isTrial !== undefined) {
      conditions.push(eq(storeSubscription.isTrial, filters.isTrial));
    }

    // Build the query with joins
    let query = db
      .select({
        id: storeSubscription.id,
        organizationId: storeSubscription.organizationId,
        planId: storeSubscription.planId,
        status: storeSubscription.status,
        startDate: storeSubscription.startDate,
        currentPeriodEnd: storeSubscription.currentPeriodEnd,
        isTrial: storeSubscription.isTrial,
        priceOverride: storeSubscription.priceOverride,
        cancelledAt: storeSubscription.cancelledAt,
        cancellationReason: storeSubscription.cancellationReason,
        createdAt: storeSubscription.createdAt,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        planName: fitstackPlan.name,
        planPrice: fitstackPlan.price,
        planCurrency: fitstackPlan.currency,
        computedStatus: this.getSubscriptionStatusSql(),
      })
      .from(storeSubscription)
      .leftJoin(organization, eq(storeSubscription.organizationId, organization.id))
      .leftJoin(fitstackPlan, eq(storeSubscription.planId, fitstackPlan.id));

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Order by createdAt desc
    query = query.orderBy(desc(storeSubscription.createdAt)) as any;

    // Get total count for pagination
    let countQuery = db
      .select({ count: count() })
      .from(storeSubscription);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }

    const [totalResult] = await countQuery;
    const total = Number(totalResult?.count ?? 0);

    // Apply pagination
    const records = await query.limit(limit).offset(offset) as SubscriptionWithDetails[];

    // Filter by computed status if needed
    let filteredData = records;
    if (filters.status && filters.status !== 'all') {
      filteredData = records.filter(d => d.computedStatus === filters.status);
    }

    return {
      data: filteredData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(id: number): Promise<SubscriptionWithDetails | null> {
    const [record] = await db
      .select({
        id: storeSubscription.id,
        organizationId: storeSubscription.organizationId,
        planId: storeSubscription.planId,
        status: storeSubscription.status,
        startDate: storeSubscription.startDate,
        currentPeriodEnd: storeSubscription.currentPeriodEnd,
        isTrial: storeSubscription.isTrial,
        priceOverride: storeSubscription.priceOverride,
        cancelledAt: storeSubscription.cancelledAt,
        cancellationReason: storeSubscription.cancellationReason,
        createdAt: storeSubscription.createdAt,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        planName: fitstackPlan.name,
        planPrice: fitstackPlan.price,
        planCurrency: fitstackPlan.currency,
        computedStatus: this.getSubscriptionStatusSql(),
      })
      .from(storeSubscription)
      .leftJoin(organization, eq(storeSubscription.organizationId, organization.id))
      .leftJoin(fitstackPlan, eq(storeSubscription.planId, fitstackPlan.id))
      .where(eq(storeSubscription.id, id))
      .limit(1);

    if (!record) return null;

    return record as SubscriptionWithDetails;
  },

  async findByOrganization(organizationId: string): Promise<SubscriptionWithDetails[]> {
    const records = await db
      .select({
        id: storeSubscription.id,
        organizationId: storeSubscription.organizationId,
        planId: storeSubscription.planId,
        status: storeSubscription.status,
        startDate: storeSubscription.startDate,
        currentPeriodEnd: storeSubscription.currentPeriodEnd,
        isTrial: storeSubscription.isTrial,
        priceOverride: storeSubscription.priceOverride,
        cancelledAt: storeSubscription.cancelledAt,
        cancellationReason: storeSubscription.cancellationReason,
        createdAt: storeSubscription.createdAt,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        planName: fitstackPlan.name,
        planPrice: fitstackPlan.price,
        planCurrency: fitstackPlan.currency,
        computedStatus: this.getSubscriptionStatusSql(),
      })
      .from(storeSubscription)
      .leftJoin(organization, eq(storeSubscription.organizationId, organization.id))
      .leftJoin(fitstackPlan, eq(storeSubscription.planId, fitstackPlan.id))
      .where(eq(storeSubscription.organizationId, organizationId))
      .orderBy(desc(storeSubscription.createdAt));

    return records as SubscriptionWithDetails[];
  },

  async cancel(id: number, reason?: string): Promise<any> {
    const [updated] = await db
      .update(storeSubscription)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason || null,
      })
      .where(eq(storeSubscription.id, id))
      .returning();

    return updated;
  },

  async extendPeriod(id: number, newEndDate: Date): Promise<any> {
    const [updated] = await db
      .update(storeSubscription)
      .set({
        currentPeriodEnd: newEndDate,
        status: 'active', // Reset to active when extended
      })
      .where(eq(storeSubscription.id, id))
      .returning();

    return updated;
  },

  async delete(id: number): Promise<void> {
    await db.delete(storeSubscription).where(eq(storeSubscription.id, id));
  },

  async createManualSubscription(data: {
    organizationId: string;
    planId: number;
    startDate: Date;
    endDate: Date;
    isTrial: boolean;
    priceOverride?: string;
    paymentMethod: string;
    currency: string;
    amount?: string;
    paymentStatus?: string;
    exchangeRateApplied?: string;
    paymentMethodDetails?: any;
    paymentDate?: Date;
  }) {
    const [newSub] = await db.insert(storeSubscription).values({
      organizationId: data.organizationId,
      planId: data.planId,
      status: 'active',
      startDate: data.startDate,
      currentPeriodEnd: data.endDate,
      isTrial: data.isTrial,
      priceOverride: data.priceOverride,
    }).returning();

    const paymentAmount = data.amount || (data.isTrial ? "0.00" : (data.priceOverride || "0.00"));
    const paymentStatus = data.isTrial ? PAYMENT_STATUSES.VALIDATED : (data.paymentStatus || PAYMENT_STATUSES.PROCESSING);

    await db.insert(platformPayment).values({
      organizationId: data.organizationId,
      planId: data.planId,
      amount: paymentAmount,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      status: paymentStatus,
      dueDate: data.paymentDate || data.startDate,
      paidAt: paymentStatus === PAYMENT_STATUSES.VALIDATED ? new Date() : null,
      createdAt: new Date(),
    });

    return newSub;
  },

  async getOrganizationInvoices(organizationId: string) {
    return db
      .select()
      .from(platformPayment)
      .where(eq(platformPayment.organizationId, organizationId))
      .orderBy(desc(platformPayment.createdAt));
  },

  async getStats(): Promise<{
    active: number;
    trial: number;
    expiringSoon: number;
    suspended: number;
  }> {
    try {
      const computedStatus = this.getSubscriptionStatusSql();

      const result = await db
        .select({
          active: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE} THEN 1 END)`,
          trial: sql<number>`COUNT(CASE WHEN ${storeSubscription.isTrial} = true AND ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE} THEN 1 END)`,
          expiringSoon: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE} THEN 1 END)`,
          suspended: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED} THEN 1 END)`,
        })
        .from(storeSubscription);

      return {
        active: Number(result[0]?.active ?? 0),
        trial: Number(result[0]?.trial ?? 0),
        expiringSoon: Number(result[0]?.expiringSoon ?? 0),
        suspended: Number(result[0]?.suspended ?? 0),
      };
    } catch (error) {
      console.error('[platformSubscriptionsRepository.getStats] DB error:', error);
      throw error;
    }
  },
};