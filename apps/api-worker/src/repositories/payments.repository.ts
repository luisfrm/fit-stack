import { eq, and, or, sql, gte, lte, desc, like, isNull, isNotNull, type Db } from '@workspace/database/factory';
import { payment, gymMember, organizationDocumentSequence } from '@workspace/database/schema';
import type { IPaymentMethodDetails } from '@workspace/shared';
import type { OrganizationDateManager } from '../lib/date-manager';

/**
 * True when a payment can be exactly normalized to the organization primary
 * currency with the persisted `exchange_rate_applied`.
 *
 * `exchange_rate_applied` reads "1 {plan_snapshot_currency} = rate
 * {currency_paid}" (same semantic the receipt composer uses). Therefore the
 * only exact one-hop cases are:
 *   1. the payment is already in the primary currency, or
 *   2. the plan currency IS the primary currency and the payment is in another
 *      currency with a valid persisted rate.
 *
 * It is never safe to divide when the plan currency differs from the primary
 * currency: the result would be expressed in the plan currency, and the
 * historical plan→primary rate is not persisted. Those rows stay unconverted.
 */
function normalizedToPrimaryCondition(primaryCurrency: string) {
  return sql`(
    ${payment.currencyPaid} = ${primaryCurrency}
    OR (
      ${payment.planSnapshotCurrency} = ${primaryCurrency}
      AND ${payment.currencyPaid} <> ${payment.planSnapshotCurrency}
      AND ${payment.exchangeRateApplied} IS NOT NULL
      AND ${payment.exchangeRateApplied} > 0
    )
  )`;
}

/** Exact normalized cents, rounded PER PAYMENT (receipt semantics). */
function normalizedAmountSql(primaryCurrency: string) {
  return sql<number>`COALESCE(SUM(
    CASE
      WHEN ${normalizedToPrimaryCondition(primaryCurrency)} THEN
        CASE
          WHEN ${payment.currencyPaid} = ${primaryCurrency} THEN ${payment.amountPaid}
          ELSE ROUND(${payment.amountPaid}::numeric / ${payment.exchangeRateApplied})::bigint
        END
    END
  ), 0)`.mapWith(Number);
}

/** Raw cents that could NOT be normalized (never assumed to be 1:1). */
function unconvertedAmountSql(primaryCurrency: string) {
  return sql<number>`COALESCE(SUM(
    CASE WHEN NOT ${normalizedToPrimaryCondition(primaryCurrency)}
      THEN ${payment.amountPaid}
      ELSE 0
    END
  ), 0)`.mapWith(Number);
}

function unconvertedCountSql(primaryCurrency: string) {
  return sql<number>`COALESCE(SUM(
    CASE WHEN NOT ${normalizedToPrimaryCondition(primaryCurrency)}
      THEN 1
      ELSE 0
    END
  ), 0)`.mapWith(Number);
}

export interface IPayment {
  id?: number;
  organizationId: string;
  memberId: number;
  subscriptionId?: number | null;

  planSnapshotName: string;
  /** Integer cents. */
  planSnapshotPrice: number;
  planSnapshotCurrency: string;
  /**
   * Plan duration at time of payment (defines the period).
   * NULL in rows created prior to snapshot: calculation falls back to live plan.
   */
  planSnapshotDurationValue?: number | null;
  planSnapshotDurationUnit?: string | null;

  /** Integer cents. */
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;

  status?: 'processing' | 'validated' | 'voided';
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;

  // Correlative receipt. NULL = prior to system (pre_system).
  receiptNumber?: string | null;
  documentType?: 'receipt' | 'invoice';
  receiptIssuedAt?: Date | null;
  receiptPdfKey?: string | null;
  receiptVoided?: boolean;
  voidedBy?: string | null;
  voidedAt?: Date | null;
  voidReason?: string | null;

  paymentDate?: Date;
  createdAt?: string | Date;
}

export interface ReceiptReportScope {
  fromUtc?: Date;
  toUtc?: Date;
  method?: string;
}

/**
 * Base report scope: `validated` payments + any payment with a
 * receipt number (covers `voided` with preserved number). `processing` / `voided`
 * without number are not receipts and are excluded. Date range by
 * `receipt_issued_at` for numbered receipts and `payment_date` for unnumbered.
 */
function receiptReportScope(organizationId: string, filters: ReceiptReportScope) {
  const conds = [
    eq(payment.organizationId, organizationId),
    or(eq(payment.status, 'validated'), isNotNull(payment.receiptNumber)),
  ];

  if (filters.fromUtc || filters.toUtc) {
    const numberedRange = [
      isNotNull(payment.receiptNumber),
      ...(filters.fromUtc ? [gte(payment.receiptIssuedAt, filters.fromUtc)] : []),
      ...(filters.toUtc ? [lte(payment.receiptIssuedAt, filters.toUtc)] : []),
    ];
    const unnumberedRange = [
      isNull(payment.receiptNumber),
      ...(filters.fromUtc ? [gte(payment.paymentDate, filters.fromUtc)] : []),
      ...(filters.toUtc ? [lte(payment.paymentDate, filters.toUtc)] : []),
    ];
    conds.push(or(and(...numberedRange), and(...unnumberedRange)));
  }

  if (filters.method) {
    conds.push(eq(payment.paymentMethod, filters.method));
  }

  return and(...conds);
}

export function createPaymentsRepository(db: Db) {
  return {
    async create(organizationId: string, data: Omit<IPayment, 'id' | 'createdAt' | 'organizationId'>): Promise<IPayment> {
      const inserted = await db
        .insert(payment)
        .values({
          organizationId,
          memberId: data.memberId,
          subscriptionId: data.subscriptionId,
          planSnapshotName: data.planSnapshotName,
          planSnapshotPrice: data.planSnapshotPrice,
          planSnapshotCurrency: data.planSnapshotCurrency,
          planSnapshotDurationValue: data.planSnapshotDurationValue ?? null,
          planSnapshotDurationUnit: data.planSnapshotDurationUnit ?? null,
          amountPaid: data.amountPaid,
          currencyPaid: data.currencyPaid,
          exchangeRateApplied: data.exchangeRateApplied?.toString() ?? null,
          status: data.status ?? 'validated',
          paymentMethod: data.paymentMethod,
          paymentMethodDetails: data.paymentMethodDetails,
          receiptNumber: data.receiptNumber ?? null,
          documentType: data.documentType ?? 'receipt',
          receiptIssuedAt: data.receiptIssuedAt ?? null,
          receiptPdfKey: data.receiptPdfKey ?? null,
          // `tax_override_reason` is legacy READ-ONLY: the column stays so
          // historical receipts keep their audit trail, but no write path sets
          // it anymore (the breakdown always comes from `COUNTRIES`).
          receiptVoided: data.receiptVoided ?? false,
          voidedBy: data.voidedBy ?? null,
          voidedAt: data.voidedAt ?? null,
          voidReason: data.voidReason ?? null,
          paymentDate: data.paymentDate ?? new Date(),
        })
        .returning();
      return inserted[0] as unknown as IPayment;
    },

    async findById(organizationId: string, id: number): Promise<IPayment | undefined> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, id), eq(payment.organizationId, organizationId)));
      return records[0] as unknown as IPayment | undefined;
    },

    async findBySubscriptionId(organizationId: string, subscriptionId: number): Promise<IPayment | undefined> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.subscriptionId, subscriptionId), eq(payment.organizationId, organizationId)));
      return records[0] as unknown as IPayment | undefined;
    },

    async findByMemberId(organizationId: string, memberId: number): Promise<IPayment[]> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.memberId, memberId), eq(payment.organizationId, organizationId)));
      return records as unknown as IPayment[];
    },

    /**
     * Updates payment status. When voiding (`voided`), ALWAYS persists
     * audit fields (`voidedBy`/`voidedAt`/`voidReason`), whether or not a receipt
     * was issued: "rejected" vs "voided" is derived via `getVoidKind`, not from
     * separate columns. `receiptVoided` is handled by the receipts repository.
     */
    async updateStatus(
      organizationId: string,
      id: number,
      status: 'processing' | 'validated' | 'voided',
      meta?: { voidedBy?: string; voidReason?: string; voidedAt?: Date }
    ): Promise<IPayment | undefined> {
      const update: Record<string, unknown> = { status };
      if (status === 'voided') {
        // COALESCE preserves initial audit info: an idempotent re-void must
        // not overwrite `voidedBy`/`voidedAt`/`voidReason` with null.
        update.voidedBy = sql`COALESCE(${payment.voidedBy}, ${meta?.voidedBy ?? null})`;
        update.voidedAt = sql`COALESCE(${payment.voidedAt}, ${meta?.voidedAt ?? new Date()})`;
        update.voidReason = sql`COALESCE(${payment.voidReason}, ${meta?.voidReason ?? null})`;
      }
      const updated = await db
        .update(payment)
        .set(update)
        .where(and(eq(payment.id, id), eq(payment.organizationId, organizationId)))
        .returning();
      return updated[0] as unknown as IPayment | undefined;
    },

    async getAggregatedPayments(
      organizationId: string,
      startDate: Date,
      dateManager: OrganizationDateManager,
      primaryCurrency: string,
    ) {
      return db
        .select({
          day: dateManager.formatDaySql(payment.paymentDate),
          currency: payment.currencyPaid,
          amount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          normalizedAmount: normalizedAmountSql(primaryCurrency),
          unconvertedAmount: unconvertedAmountSql(primaryCurrency),
          unconvertedCount: unconvertedCountSql(primaryCurrency),
          exchangeRate: payment.exchangeRateApplied,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
        .orderBy(sql`1`);
    },

    async getAggregatedPaymentsMonthly(
      organizationId: string,
      startDate: Date,
      dateManager: OrganizationDateManager,
      primaryCurrency: string,
    ) {
      return db
        .select({
          month: dateManager.formatMonthSql(payment.paymentDate),
          currency: payment.currencyPaid,
          amount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          normalizedAmount: normalizedAmountSql(primaryCurrency),
          unconvertedAmount: unconvertedAmountSql(primaryCurrency),
          unconvertedCount: unconvertedCountSql(primaryCurrency),
          exchangeRate: payment.exchangeRateApplied,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
        .orderBy(sql`1`);
    },

    async getPendingPaymentsCount(organizationId: string) {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(payment)
        .where(and(eq(payment.organizationId, organizationId), eq(payment.status, 'processing')));
      return result[0]?.count || 0;
    },

    async getPaymentsByMethod(organizationId: string, startDate: Date) {      return db
        .select({
          paymentMethod: payment.paymentMethod,
          currencyPaid: payment.currencyPaid,
          totalAmount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(payment.paymentMethod, payment.currencyPaid)
        .orderBy(sql`count(*) DESC`);
    },

    /**
     * Receipt report. Status classification lives in
     * the service; here we only SQL-filter what is expressible (requested status,
     * method, date range) over the shared base scope.
     */
    async findReceiptReportRows(
      organizationId: string,
      filters: ReceiptReportScope & {
        state?: 'all' | 'issued' | 'pending' | 'voided' | 'pre_system';
        page: number;
        limit: number;
      },
    ) {
      const conds = [receiptReportScope(organizationId, filters)];

      switch (filters.state ?? 'all') {
        // Issued = numbered, not voided AND with PDF (pending is proper
        // subset: numbered without PDF). Summary uses the same rule.
        case 'issued':
          conds.push(
            and(
              isNotNull(payment.receiptNumber),
              eq(payment.receiptVoided, false),
              isNotNull(payment.receiptPdfKey),
            ),
          );
          break;
        case 'pending':
          conds.push(
            and(
              isNotNull(payment.receiptNumber),
              eq(payment.receiptVoided, false),
              isNull(payment.receiptPdfKey),
            ),
          );
          break;
        case 'voided':
          conds.push(eq(payment.receiptVoided, true));
          break;
        case 'pre_system':
          conds.push(isNull(payment.receiptNumber));
          break;
      }

      const where = and(...conds);
      const offset = (Math.max(1, filters.page) - 1) * filters.limit;

      const rows = await db
        .select({
          paymentId: payment.id,
          receiptNumber: payment.receiptNumber,
          receiptVoided: payment.receiptVoided,
          receiptPdfKey: payment.receiptPdfKey,
          receiptIssuedAt: payment.receiptIssuedAt,
          memberName: gymMember.firstName,
          memberLastName: gymMember.lastName,
          memberEmail: gymMember.email,
          planSnapshotName: payment.planSnapshotName,
          subtotal: payment.subtotal,
          taxTotal: payment.taxTotal,
          taxDetails: payment.taxDetails,
          amountPaid: payment.amountPaid,
          currencyPaid: payment.currencyPaid,
          paymentMethod: payment.paymentMethod,
          paymentStatus: payment.status,
          paymentDate: payment.paymentDate,
          taxOverrideReason: payment.taxOverrideReason,
          voidedBy: payment.voidedBy,
          voidedAt: payment.voidedAt,
          voidReason: payment.voidReason,
          // Frozen issuer + actor, for exportable ledger.
          emitterSnapshot: payment.emitterSnapshot,
          issuedBy: payment.issuedBy,
        })
        .from(payment)
        // LEFT: an orphan payment (deleted member) must appear in rows
        // just like in summary/totals, without throwing off the report.
        .leftJoin(gymMember, eq(payment.memberId, gymMember.id))
        .where(where)
        .orderBy(sql`${payment.receiptIssuedAt} DESC NULLS LAST`, desc(payment.id))
        .limit(filters.limit)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(payment)
        .where(where);

      return { rows, total: countResult[0]?.total ?? 0 };
    },

    /**
     * Money columns from the issued non-voided scope (unpaginated)
     * to aggregate totals by currency in the service. Read-only.
     */
    async findReceiptMoneyRows(organizationId: string, filters: ReceiptReportScope) {
      const where = and(
        receiptReportScope(organizationId, filters),
        isNotNull(payment.receiptNumber),
        eq(payment.receiptVoided, false),
      );

      return db
        .select({
          subtotal: payment.subtotal,
          taxTotal: payment.taxTotal,
          taxDetails: payment.taxDetails,
          amountPaid: payment.amountPaid,
          currencyPaid: payment.currencyPaid,
        })
        .from(payment)
        .where(where);
    },

    /**
     * Count by state in a single query (for summary, over the same
     * scope as the rows). Final label is assigned by the service using the
     * same rule that classifies rows.
     */
    async countReceiptStates(organizationId: string, filters: ReceiptReportScope) {
      return db
        .select({
          voided: payment.receiptVoided,
          noNumber: sql<boolean>`${payment.receiptNumber} IS NULL`,
          noPdf: sql<boolean>`${payment.receiptPdfKey} IS NULL`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(payment)
        .where(receiptReportScope(organizationId, filters))
        .groupBy(
          payment.receiptVoided,
          sql`${payment.receiptNumber} IS NULL`,
          sql`${payment.receiptPdfKey} IS NULL`,
        );
    },

    /**
     * Annual sequence state + issued numbers of the year (for gaps).
     * Parsing/validation lives in the service (pure helper from shared).
     */
    async getReceiptSequenceState(organizationId: string, year: number, slug: string) {      const [seq] = await db
        .select({ lastNumber: organizationDocumentSequence.lastNumber })
        .from(organizationDocumentSequence)
        .where(
          and(
            eq(organizationDocumentSequence.organizationId, organizationId),
            eq(organizationDocumentSequence.documentType, 'receipt'),
            eq(organizationDocumentSequence.year, year),
          ),
        );

      const escapedSlug = slug
        .toLowerCase()
        .replaceAll(/[%_\\]/g, (c) => `\\${c}`);

      const numbers = await db
        .select({
          receiptNumber: payment.receiptNumber,
          receiptVoided: payment.receiptVoided,
          voidedBy: payment.voidedBy,
          voidedAt: payment.voidedAt,
          voidReason: payment.voidReason,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            // The current number is `{year}-{seq}` (no slug) and the legacy one
            // is `{slug}-{year}-{seq}`. BOTH must match or the report goes
            // blind to one format. The slug is normalized like the correlative
            // and `%_\` are escaped so the LIKE never alters the gaps universe.
            or(
              like(payment.receiptNumber, `${year}-%`),
              like(payment.receiptNumber, `${escapedSlug}-${year}-%`),
            ),
          ),
        );

      return { lastNumber: seq?.lastNumber ?? 0, numbers };
    },
  };
}

export type PaymentsRepository = ReturnType<typeof createPaymentsRepository>;
