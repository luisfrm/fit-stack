import { eq, desc, and, or, ilike, isNull, gte, lte, sql, count, type Db } from '@workspace/database/factory';
import {
  platformSubscription,
  platformPlan,
  organization,
  platformSubscriptionPayment,
} from '@workspace/database/schema';
import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
  type PaymentStatus,
  PAYMENT_STATUSES,
  PLATFORM_GRACE_PERIODS,
} from '@workspace/shared/constants';
import type { IPaymentMethodDetails, PlanFeaturesV2 } from '@workspace/shared';

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
  /** Computed status (not stored in DB) */
  status: PlatformSubscriptionStatus;
  /** Status of latest payment (for UX logic) */
  latestPaymentStatus: PaymentStatus | null;

  // Joined fields
  organizationName: string;
  organizationSlug: string | null;
  planName: string;
  /** plan price in integer cents */
  planPrice: number;
  planCurrency: string;
  planDurationValue: number;
  planDurationUnit: 'day' | 'week' | 'month' | 'year';
  /** Plan features at query time (for payment snapshots) */
  planFeatures: PlanFeaturesV2 | null;
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
  /** If omitted, computed from plan duration */
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
  /** Snapshot of plan features at payment time (compare vs plan today) */
  featuresSnapshot?: PlanFeaturesV2 | null;
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  /** Server-derived base amount in the platform base currency (integer cents). */
  baseAmount: number;
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;
  status: PaymentStatus;
  paymentDate?: Date;
  dueDate?: Date;
  paidAt?: Date | null;
}

export function createPlatformSubscriptionsRepository(db: Db) {
  return {
    /**
     * `EXISTS(validated|refunded)` on subscription payments.
     * Single source of truth for "has a paid period" (never "the latest payment"):
     * `voided` and `processing` do not qualify.
     */
    hasValidatedPaymentSql() {
      // Explicit qualified correlation: Drizzle may render `${platformSubscription.id}`
      // unqualified in joinless queries, resolving against inner payment `id`.
      return sql<boolean>`EXISTS (
        SELECT 1 FROM platform_subscription_payment
        WHERE platform_subscription_payment.subscription_id = platform_subscription.id
          AND platform_subscription_payment.status IN (${PAYMENT_STATUSES.VALIDATED}, ${PAYMENT_STATUSES.REFUNDED})
      )`;
    },

    /**
     * SQL CASE computing SaaS status. Exact parity with
     * `computePlatformSubscriptionStatus` (`@workspace/shared`):
     * - cancelledAt IS NOT NULL => cancelled
     * - isTrial and active period => trial
     * - active period + EXISTS(validated|refunded) => active
     * - active period without qualifying payment => past_due
     * - expired <= 7 days => past_due
     * - expired <= 14 days => read_only
     * - expired > 14 days => suspended
     *
     * `voided` is IGNORED entirely: does not revoke service, grace period
     * runs from `currentPeriodEnd` and periods do NOT accumulate.
     */
    getSubscriptionStatusSql() {
      const hasValidatedPayment = this.hasValidatedPaymentSql();

      return sql<PlatformSubscriptionStatus>`CASE
        WHEN ${platformSubscription.cancelledAt} IS NOT NULL THEN ${PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED}::text
        WHEN ${platformSubscription.isTrial} = true AND ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.TRIAL}::text
        WHEN ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP AND ${hasValidatedPayment} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE}::text
        WHEN ${platformSubscription.currentPeriodEnd} >= CURRENT_TIMESTAMP THEN ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE}::text
        WHEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${platformSubscription.currentPeriodEnd})) / 86400) <= ${PLATFORM_GRACE_PERIODS.PAST_DUE_DAYS} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE}::text
        WHEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${platformSubscription.currentPeriodEnd})) / 86400) <= ${PLATFORM_GRACE_PERIODS.READ_ONLY_DAYS} THEN ${PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY}::text
        ELSE ${PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED}::text
      END`;
    },

    /**
     * Latest non-voided payment (for UX). `voided` is excluded: SaaS status
     * does not depend on "the latest payment" but on whether a qualifying one exists.
     */
    getLatestPaymentStatusSql() {
      return sql<PaymentStatus | null>`(
        SELECT platform_subscription_payment.status FROM platform_subscription_payment
        WHERE platform_subscription_payment.subscription_id = platform_subscription.id
          AND platform_subscription_payment.status <> ${PAYMENT_STATUSES.VOIDED}
        ORDER BY platform_subscription_payment.payment_date DESC, platform_subscription_payment.created_at DESC
        LIMIT 1
      )`;
    },

    getPaymentsCountSql() {
      return sql<number>`(
        SELECT COUNT(*)::int FROM platform_subscription_payment
        WHERE platform_subscription_payment.subscription_id = platform_subscription.id
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
      if (filters.search) {
        conditions.push(
          or(
            ilike(organization.name, `%${filters.search}%`),
            ilike(platformPlan.name, `%${filters.search}%`)
          )!
        );
      }
      if (filters.status === ('expiring' as any)) {
        conditions.push(
          and(
            isNull(platformSubscription.cancelledAt),
            gte(platformSubscription.currentPeriodEnd, sql`NOW()`),
            lte(platformSubscription.currentPeriodEnd, sql`NOW() + INTERVAL '7 days'`)
          )!
        );
      } else if (filters.status && filters.status !== 'all') {
        conditions.push(sql`(${this.getSubscriptionStatusSql()}) = ${filters.status}`);
      }

      const whereClause = conditions.length > 0
        ? and(...conditions)
        : undefined;

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
          planFeatures: platformPlan.features,
          status: this.getSubscriptionStatusSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
          paymentsCount: this.getPaymentsCountSql(),
        })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id));

      const [totalResult] = await db
        .select({ total: count() })
        .from(platformSubscription)
        .leftJoin(organization, eq(platformSubscription.organizationId, organization.id))
        .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id))
        .where(whereClause);

      const total = Number(totalResult?.total ?? 0);

      const records = (await baseQuery
        .where(whereClause)
        .orderBy(desc(platformSubscription.createdAt))
        .limit(limit)
        .offset(offset)) as SubscriptionWithDetails[];

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
          planFeatures: platformPlan.features,
          status: this.getSubscriptionStatusSql(),
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
          planFeatures: platformPlan.features,
          status: this.getSubscriptionStatusSql(),
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
          planFeatures: platformPlan.features,
          status: this.getSubscriptionStatusSql(),
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

    /**
     * Status of organization's latest SaaS contract with real `hasValidatedPayment`
     * (`EXISTS(validated|refunded)`, never "the latest payment"). Without
     * subscription => `SUSPENDED` with `subscriptionId: null`. `status` is produced
     * by CASE statement to ensure parity with listings; `hasValidatedPayment`
     * is exposed for guards (e.g., renewal self-service).
     */
    async getLastSubscriptionStatus(organizationId: string): Promise<{
      status: PlatformSubscriptionStatus;
      subscriptionId: number | null;
      currentPeriodEnd: Date | null;
      isTrial: boolean;
      cancelledAt: Date | null;
      hasValidatedPayment: boolean;
      latestPaymentStatus: PaymentStatus | null;
    }> {
      const [record] = await db
        .select({
          id: platformSubscription.id,
          currentPeriodEnd: platformSubscription.currentPeriodEnd,
          isTrial: platformSubscription.isTrial,
          cancelledAt: platformSubscription.cancelledAt,
          status: this.getSubscriptionStatusSql(),
          hasValidatedPayment: this.hasValidatedPaymentSql(),
          latestPaymentStatus: this.getLatestPaymentStatusSql(),
        })
        .from(platformSubscription)
        .where(eq(platformSubscription.organizationId, organizationId))
        .orderBy(desc(platformSubscription.createdAt))
        .limit(1);

      if (!record) {
        return {
          status: PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED,
          subscriptionId: null,
          currentPeriodEnd: null,
          isTrial: false,
          cancelledAt: null,
          hasValidatedPayment: false,
          latestPaymentStatus: null,
        };
      }

      return {
        status: record.status,
        subscriptionId: record.id,
        currentPeriodEnd: record.currentPeriodEnd,
        isTrial: record.isTrial,
        cancelledAt: record.cancelledAt,
        hasValidatedPayment: record.hasValidatedPayment,
        latestPaymentStatus: record.latestPaymentStatus,
      };
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

    /**
     * Number of SaaS payment rows attached to a subscription. Used before a
     * hard delete: with payments the record is financial history and must be
     * cancelled instead (the FK is `RESTRICT` as the DB-level backstop).
     */
    async countPaymentsBySubscription(subscriptionId: number): Promise<number> {
      const [row] = await db
        .select({ total: count() })
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.subscriptionId, subscriptionId));
      return Number(row?.total ?? 0);
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
          featuresSnapshot: (data.featuresSnapshot ?? null) as any,
          amountPaid: data.amountPaid,
          currencyPaid: data.currencyPaid,
          exchangeRateApplied: data.exchangeRateApplied ?? null,
          baseAmount: data.baseAmount,
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
        paymentMethodDetails: r.paymentMethodDetails as IPaymentMethodDetails | Record<string, any> | null,
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

    /**
     * Updates SaaS payment status. When voiding (`voided`), ALWAYS persists
     * audit fields (`voidedBy`/`voidedAt`/`voidReason`), whether or not a receipt exists.
     * `receiptVoided` is handled by `markPlatformReceiptVoided` (shared repo).
     */
    async updatePaymentStatus(
      id: number,
      status: PaymentStatus,
      meta?: { paidAt?: Date | null; voidedBy?: string; voidReason?: string; voidedAt?: Date }
    ): Promise<void> {
      const update: Record<string, any> = { status };
      if (status === PAYMENT_STATUSES.VALIDATED) {
        update.paidAt = meta?.paidAt ?? new Date();
      } else if (status === PAYMENT_STATUSES.VOIDED) {
        update.paidAt = null;
        // COALESCE preserves initial audit info: an idempotent re-void must
        // not overwrite `voidedBy`/`voidedAt`/`voidReason` with null.
        update.voidedBy = sql`COALESCE(${platformSubscriptionPayment.voidedBy}, ${meta?.voidedBy ?? null})`;
        update.voidedAt = sql`COALESCE(${platformSubscriptionPayment.voidedAt}, ${meta?.voidedAt ?? new Date()})`;
        update.voidReason = sql`COALESCE(${platformSubscriptionPayment.voidReason}, ${meta?.voidReason ?? null})`;
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
            eq(platformSubscriptionPayment.status, PAYMENT_STATUSES.PROCESSING)
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

    /**
     * Monthly SaaS revenue series in UTC (`validated` payments only).
     * Uses same formula as `getStats().monthlyRevenueCents`
     * (`COALESCE(baseAmount, amountPaid)`) so current month bucket matches KPI.
     * Note: if plans are in different currencies, sums aggregate currencies
     * just like `monthlyRevenueCents` — true multi-currency normalization
     * is a follow-up (see `vaults/guides/FUTURE_IDEAS.md` §5).
     */
    async getMonthlyRevenue(months: number): Promise<
      { month: string; totalCents: number; count: number }[]
    > {
      const safeMonths = Math.min(24, Math.max(1, Math.floor(months)));
      const rows = await db
        .select({
          month: sql<string>`TO_CHAR(m.month, 'YYYY-MM-01')`,
          totalCents: sql<number>`COALESCE(SUM(COALESCE(${platformSubscriptionPayment.baseAmount}, ${platformSubscriptionPayment.amountPaid})), 0)::int`,
          count: sql<number>`COUNT(${platformSubscriptionPayment.id})::int`,
        })
        .from(
          sql`(SELECT DATE_TRUNC('month', CURRENT_TIMESTAMP) - (GENERATE_SERIES(0, ${safeMonths} - 1)) * INTERVAL '1 month' AS month) m`,
        )
        .leftJoin(
          platformSubscriptionPayment,
          and(
            eq(platformSubscriptionPayment.status, PAYMENT_STATUSES.VALIDATED),
            sql`DATE_TRUNC('month', ${platformSubscriptionPayment.paymentDate} AT TIME ZONE 'UTC') = m.month`,
          ),
        )
        .groupBy(sql`m.month`)
        .orderBy(sql`m.month`);

      return rows.map((r) => ({
        month: r.month,
        totalCents: Number(r.totalCents ?? 0),
        count: Number(r.count ?? 0),
      }));
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
