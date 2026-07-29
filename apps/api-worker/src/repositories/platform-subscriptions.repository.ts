import { eq, desc, and, sql, count, type Db } from '@workspace/database/factory';
import {
  platformSubscription,
  platformPlan,
  organization,
  platformSubscriptionPayment,
} from '@workspace/database/schema';
import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
  PAYMENT_STATUSES,
  PLATFORM_GRACE_PERIODS,
} from '@workspace/shared/constants';
import type { PaymentStatus } from '@workspace/shared/constants';

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
  startDate: Date;
  currentPeriodEnd: Date;
  isTrial: boolean;
  /** precio en centavos (number) */
  priceOverride: number | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  /** Status computado (no se guarda) */
  computedStatus: PlatformSubscriptionStatus;
  /** Status del último pago (para lógica de UX) */
  latestPaymentStatus: PaymentStatus | null;

  // Joined fields
  organizationName: string;
  organizationSlug: string | null;
  planName: string;
  /** precio del plan en centavos */
  planPrice: number;
  planCurrency: string;
  planDurationValue: number;
  planDurationUnit: 'day' | 'week' | 'month' | 'year';
  paymentsCount: number;
}

export interface PaginatedSubscriptions {
  data: SubscriptionWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NewPlatformSubscriptionData {
  organizationId: string;
  planId: number;
  startDate?: Date;
  /** Si no se provee, se calcula con la duración del plan */
  currentPeriodEnd?: Date;
  isTrial?: boolean;
  priceOverride?: number | null;
}

export interface NewPlatformPaymentData {
  subscriptionId: number;
  organizationId: string;
  planId: number;
  planSnapshotName: string;
  planSnapshotPrice: number;
  planSnapshotCurrency: string;
  planSnapshotDurationValue: number;
  planSnapshotDurationUnit: 'day' | 'week' | 'month' | 'year';
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  baseAmount?: number | null;
  paymentMethod: string;
  paymentMethodDetails?: Record<string, any> | null;
  status: PaymentStatus;
  paymentDate?: Date;
  dueDate?: Date;
  paidAt?: Date | null;
}

export function createPlatformSubscriptionsRepository(db: Db) {
  return {
    /**
     * SQL CASE que computa el status según:
     * - cancelledAt IS NOT NULL => cancelled
     * - último pago voided/invalid => past_due
     * - último pago processing => past_due (sin pago validado)
     * - currentPeriodEnd >= now => active
     * - <= 7 días overdue => past_due
     * - <= 14 días overdue => read_only
     * - > 14 días => suspended
     */
    getSubscriptionStatusSql() {
      // BUG FIX: anteriormente comparaba `plan_id = ${fitstackPlan.id}` con
      // una columna incorrecta. Ahora la subquery apunta a la suscripción actual
      // y ordena por payment_date DESC.
      const latestPaymentStatus = sql<PaymentStatus | null>`(
        SELECT status FROM platform_subscription_payment
        WHERE subscription_id = ${platformSubscription.id}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT 1
      )`;

      return sql<PlatformSubscriptionStatus>`CASE
        WHEN ${platformSubscription.cancelledAt} IS NOT NULL THEN ${PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED}::text
        WHEN ${platformSubscription.isTrial} = true AND ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.TRIAL}::text
        WHEN ${latestPaymentStatus} IN (${PAYMENT_STATUSES.VALIDATED}, ${PAYMENT_STATUSES.REFUNDED}) AND ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE}::text
        WHEN ${latestPaymentStatus} = ${PAYMENT_STATUSES.PENDING} AND ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE}::text
        WHEN ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE}::text
        WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${platformSubscription.currentPeriodEnd})) / 86400 <= ${PLATFORM_GRACE_PERIODS.PAST_DUE_DAYS} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE}::text
        WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${platformSubscription.currentPeriodEnd})) / 86400 <= ${PLATFORM_GRACE_PERIODS.READ_ONLY_DAYS} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY}::text
        ELSE ${PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED}::text
      END`;
    },

    getLatestPaymentStatusSql() {
      return sql<PaymentStatus | null>`(
        SELECT status FROM platform_subscription_payment
        WHERE subscription_id = ${platformSubscription.id}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT 1
      )`;
    },

    getPaymentsCountSql() {
      return sql<number>`(
        SELECT COUNT(*)::int FROM platform_subscription_payment
        WHERE subscription_id = ${platformSubscription.id}
      )`;
    },

    async findAll(filters: SubscriptionFilters = {}): Promise<PaginatedSubscriptions> {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      const conditions: any[] = [];

      if (filters.organizationId) {
        conditions.push(eq(platformSubscription.organizationId, filters.organizationId));
      }
      if (filters.planId) {
        conditions.push(eq(platformSubscription.planId, filters.planId));
      }
      if (filters.isTrial !== undefined) {
        conditions.push(eq(platformSubscription.isTrial, filters.isTrial));
      }

      const baseQuery = db
        .select({
          id: platformSubscription.id,
          organizationId: platformSubscription.organizationId,
          planId: platformSubscription.planId,
          startDate: platformSubscription.startDate,
          currentPeriodEnd: platformSubscription.currentPeriodEnd,
          isTrial: platformSubscription.isTrial,
          priceOverride: platformSubscription.priceOverride,
          cancelledAt: platformSubscription.cancelledAt,
          cancellationReason: platformSubscription.cancellationReason,
          createdAt: platformSubscription.createdAt,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          planName: platformPlan.name,
          planPrice: platformPlan.price,
          planCurrency: platformPlan.currency,
          planDurationValue: platformPlan.durationValue,
          planDurationUnit: platformPlan.durationUnit,
          computedStatus: this.getSubscriptionStatusSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
          paymentsCount: this.getPaymentsCountSql(),
        })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id));

      const filteredQuery = conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery;

      const [totalResult] = await db
        .select({ total: count() })
        .from(platformSubscription)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = Number(totalResult?.total ?? 0);

      const allRecords = (await filteredQuery
        .orderBy(desc(platformSubscription.createdAt))
        .limit(limit)
        .offset(offset)) as SubscriptionWithDetails[];

      // Filtro por status se aplica post-query (el status es computado)
      const records = filters.status && filters.status !== 'all'
        ? allRecords.filter((r) => r.computedStatus === filters.status)
        : allRecords;

      return {
        data: records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    },

    async findById(id: number): Promise<SubscriptionWithDetails | null> {
      const [record] = await db
        .select({
          id: platformSubscription.id,
          organizationId: platformSubscription.organizationId,
          planId: platformSubscription.planId,
          startDate: platformSubscription.startDate,
          currentPeriodEnd: platformSubscription.currentPeriodEnd,
          isTrial: platformSubscription.isTrial,
          priceOverride: platformSubscription.priceOverride,
          cancelledAt: platformSubscription.cancelledAt,
          cancellationReason: platformSubscription.cancellationReason,
          createdAt: platformSubscription.createdAt,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          planName: platformPlan.name,
          planPrice: platformPlan.price,
          planCurrency: platformPlan.currency,
          planDurationValue: platformPlan.durationValue,
          planDurationUnit: platformPlan.durationUnit,
          computedStatus: this.getSubscriptionStatusSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
          paymentsCount: this.getPaymentsCountSql(),
        })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id))
        .where(eq(platformSubscription.id, id))
        .limit(1);

      return (record as SubscriptionWithDetails) ?? null;
    },

    async findByOrganization(organizationId: string): Promise<SubscriptionWithDetails[]> {
      const records = await db
        .select({
          id: platformSubscription.id,
          organizationId: platformSubscription.organizationId,
          planId: platformSubscription.planId,
          startDate: platformSubscription.startDate,
          currentPeriodEnd: platformSubscription.currentPeriodEnd,
          isTrial: platformSubscription.isTrial,
          priceOverride: platformSubscription.priceOverride,
          cancelledAt: platformSubscription.cancelledAt,
          cancellationReason: platformSubscription.cancellationReason,
          createdAt: platformSubscription.createdAt,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          planName: platformPlan.name,
          planPrice: platformPlan.price,
          planCurrency: platformPlan.currency,
          planDurationValue: platformPlan.durationValue,
          planDurationUnit: platformPlan.durationUnit,
          computedStatus: this.getSubscriptionStatusSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
          paymentsCount: this.getPaymentsCountSql(),
        })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id))
        .where(eq(platformSubscription.organizationId, organizationId))
        .orderBy(desc(platformSubscription.createdAt));

      return records as SubscriptionWithDetails[];
    },

    async findActiveByOrganization(organizationId: string): Promise<SubscriptionWithDetails | null> {
      const records = await db
        .select({
          id: platformSubscription.id,
          organizationId: platformSubscription.organizationId,
          planId: platformSubscription.planId,
          startDate: platformSubscription.startDate,
          currentPeriodEnd: platformSubscription.currentPeriodEnd,
          isTrial: platformSubscription.isTrial,
          priceOverride: platformSubscription.priceOverride,
          cancelledAt: platformSubscription.cancelledAt,
          cancellationReason: platformSubscription.cancellationReason,
          createdAt: platformSubscription.createdAt,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          planName: platformPlan.name,
          planPrice: platformPlan.price,
          planCurrency: platformPlan.currency,
          planDurationValue: platformPlan.durationValue,
          planDurationUnit: platformPlan.durationUnit,
          computedStatus: this.getSubscriptionStatusSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
          paymentsCount: this.getPaymentsCountSql(),
        })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id))
        .where(eq(platformSubscription.organizationId, organizationId))
        .orderBy(desc(platformSubscription.createdAt))
        .limit(1);

      return (records[0] as SubscriptionWithDetails) ?? null;
    },

    async create(data: NewPlatformSubscriptionData): Promise<{ id: number }> {
      const [created] = await db
        .insert(platformSubscription)
        .values({
          organizationId: data.organizationId,
          planId: data.planId,
          startDate: data.startDate ?? new Date(),
          currentPeriodEnd: data.currentPeriodEnd ?? new Date(),
          isTrial: data.isTrial ?? false,
          priceOverride: data.priceOverride ?? null,
        })
        .returning({ id: platformSubscription.id });
      if (!created) throw new Error('Failed to create subscription');
      return created;
    },

    async updatePeriodEnd(id: number, newEndDate: Date): Promise<void> {
      await db
        .update(platformSubscription)
        .set({ currentPeriodEnd: newEndDate })
        .where(eq(platformSubscription.id, id));
    },

    async cancel(id: number, reason?: string): Promise<void> {
      await db
        .update(platformSubscription)
        .set({
          cancelledAt: new Date(),
          cancellationReason: reason || null,
        })
        .where(eq(platformSubscription.id, id));
    },

    async delete(id: number): Promise<void> {
      await db.delete(platformSubscription).where(eq(platformSubscription.id, id));
    },

    /* ── PAYMENTS ── */

    async createPayment(data: NewPlatformPaymentData): Promise<{ id: number }> {
      const [created] = await db
        .insert(platformSubscriptionPayment)
        .values({
          subscriptionId: data.subscriptionId,
          organizationId: data.organizationId,
          planId: data.planId,
          planSnapshotName: data.planSnapshotName,
          planSnapshotPrice: data.planSnapshotPrice,
          planSnapshotCurrency: data.planSnapshotCurrency,
          planSnapshotDurationValue: data.planSnapshotDurationValue,
          planSnapshotDurationUnit: data.planSnapshotDurationUnit,
          amountPaid: data.amountPaid,
          currencyPaid: data.currencyPaid,
          exchangeRateApplied: data.exchangeRateApplied ?? null,
          baseAmount: data.baseAmount ?? null,
          paymentMethod: data.paymentMethod,
          paymentMethodDetails: (data.paymentMethodDetails ?? null) as any,
          status: data.status,
          paymentDate: data.paymentDate ?? new Date(),
          dueDate: data.dueDate ?? data.paymentDate ?? new Date(),
          paidAt:
            data.paidAt ??
            (data.status === PAYMENT_STATUSES.VALIDATED ? new Date() : null),
        })
        .returning({ id: platformSubscriptionPayment.id });
      if (!created) throw new Error('Failed to create payment');
      return created;
    },

    async findPaymentsBySubscription(subscriptionId: number) {
      const records = await db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.subscriptionId, subscriptionId))
        .orderBy(desc(platformSubscriptionPayment.paymentDate));
      return records.map((r) => ({
        ...r,
        paymentMethodDetails: r.paymentMethodDetails as Record<string, any> | null,
      }));
    },

    async findPaymentById(id: number) {
      const [record] = await db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.id, id))
        .limit(1);
      return record ?? null;
    },

    async updatePaymentStatus(
      id: number,
      status: PaymentStatus,
      paidAt?: Date | null
    ): Promise<void> {
      const update: Record<string, any> = { status };
      if (status === PAYMENT_STATUSES.VALIDATED) {
        update.paidAt = paidAt ?? new Date();
      } else if (
        status === PAYMENT_STATUSES.VOIDED ||
        status === PAYMENT_STATUSES.INVALID
      ) {
        update.paidAt = null;
      } else if (status === PAYMENT_STATUSES.REFUNDED) {
        update.refundedAt = new Date();
      }
      await db
        .update(platformSubscriptionPayment)
        .set(update)
        .where(eq(platformSubscriptionPayment.id, id));
    },

    async hasPendingPayment(subscriptionId: number): Promise<boolean> {
      const [record] = await db
        .select({ id: platformSubscriptionPayment.id })
        .from(platformSubscriptionPayment)
        .where(
          and(
            eq(platformSubscriptionPayment.subscriptionId, subscriptionId),
            sql`${platformSubscriptionPayment.status} IN ('pending', 'processing')`
          )
        )
        .limit(1);
      return !!record;
    },

    async getStats(): Promise<{
      active: number;
      trial: number;
      pastDue: number;
      readOnly: number;
      suspended: number;
      cancelled: number;
      total: number;
      monthlyRevenueCents: number;
      previousMonthRevenueCents: number;
      mrrCents: number;
    }> {
      const computedStatus = this.getSubscriptionStatusSql();

      const [result] = await db
        .select({
          active: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE} THEN 1 END)::int`,
          trial: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.TRIAL} THEN 1 END)::int`,
          pastDue: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE} THEN 1 END)::int`,
          readOnly: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY} THEN 1 END)::int`,
          suspended: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED} THEN 1 END)::int`,
          cancelled: sql<number>`COUNT(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED} THEN 1 END)::int`,
          total: count(),
        })
        .from(platformSubscription);

      // Compute monthly B2B revenue and previous month revenue for growth calculation
      const [revenueResult] = await db
        .select({
          monthlyRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${platformSubscriptionPayment.status} = ${PAYMENT_STATUSES.VALIDATED} AND DATE_TRUNC('month', ${platformSubscriptionPayment.paymentDate}) = DATE_TRUNC('month', CURRENT_TIMESTAMP) THEN COALESCE(${platformSubscriptionPayment.baseAmount}, ${platformSubscriptionPayment.amountPaid}) ELSE 0 END), 0)::int`,
          previousMonthRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${platformSubscriptionPayment.status} = ${PAYMENT_STATUSES.VALIDATED} AND DATE_TRUNC('month', ${platformSubscriptionPayment.paymentDate}) = DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '1 month') THEN COALESCE(${platformSubscriptionPayment.baseAmount}, ${platformSubscriptionPayment.amountPaid}) ELSE 0 END), 0)::int`,
        })
        .from(platformSubscriptionPayment);

      // Compute Monthly Recurring Revenue (MRR) from active subscriptions
      const [mrrResult] = await db
        .select({
          mrrCents: sql<number>`COALESCE(SUM(CASE WHEN ${computedStatus} = ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE} THEN COALESCE(${platformSubscription.priceOverride}, ${platformPlan.price}) ELSE 0 END), 0)::int`,
        })
        .from(platformSubscription)
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id));

      return {
        active: Number(result?.active ?? 0),
        trial: Number(result?.trial ?? 0),
        pastDue: Number(result?.pastDue ?? 0),
        readOnly: Number(result?.readOnly ?? 0),
        suspended: Number(result?.suspended ?? 0),
        cancelled: Number(result?.cancelled ?? 0),
        total: Number(result?.total ?? 0),
        monthlyRevenueCents: Number(revenueResult?.monthlyRevenueCents ?? 0),
        previousMonthRevenueCents: Number(revenueResult?.previousMonthRevenueCents ?? 0),
        mrrCents: Number(mrrResult?.mrrCents ?? 0),
      };
    },

    async getOrganizationInvoices(organizationId: string) {
      return db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.organizationId, organizationId))
        .orderBy(desc(platformSubscriptionPayment.paymentDate));
    },
  };
}

export type PlatformSubscriptionsRepository = ReturnType<typeof createPlatformSubscriptionsRepository>;
