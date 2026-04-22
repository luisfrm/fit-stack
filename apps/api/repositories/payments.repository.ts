import { db, eq, and, sql } from '@workspace/database/client'
import { payment } from '@workspace/database/schema'

export interface IPayment {
  id?: number
  organizationId: string
  memberId: number
  subscriptionId?: number | null

  // Snapshots
  planSnapshotName: string
  planSnapshotPrice: string | number
  planSnapshotCurrency: string

  // Real Payment
  amountPaid: string | number
  currencyPaid: string
  exchangeRateApplied?: string | null

  status?: 'processing' | 'validated' | 'invalid' | 'voided'
  paymentMethod: string
  paymentMethodDetails?: Record<string, any> | null

  paymentDate?: Date
  createdAt?: string | Date
}

export const paymentsRepository = {
  async create(organizationId: string, data: Omit<IPayment, 'id' | 'createdAt' | 'organizationId'>): Promise<IPayment> {
    const inserted = await db.insert(payment).values({
      organizationId,
      memberId: data.memberId,
      subscriptionId: data.subscriptionId,
      planSnapshotName: data.planSnapshotName,
      planSnapshotPrice: data.planSnapshotPrice.toString(),
      planSnapshotCurrency: data.planSnapshotCurrency,
      amountPaid: data.amountPaid.toString(),
      currencyPaid: data.currencyPaid,
      exchangeRateApplied: data.exchangeRateApplied?.toString() ?? null,
      status: data.status ?? 'validated',
      paymentMethod: data.paymentMethod,
      paymentMethodDetails: data.paymentMethodDetails,
      paymentDate: data.paymentDate ?? new Date(),
    }).returning()
    return inserted[0] as unknown as IPayment
  },

  async findBySubscriptionId(organizationId: string, subscriptionId: number): Promise<IPayment | undefined> {
    const records = await db.select().from(payment).where(and(
      eq(payment.subscriptionId, subscriptionId),
      eq(payment.organizationId, organizationId)
    ))
    return records[0] as unknown as IPayment | undefined
  },

  async findByMemberId(organizationId: string, memberId: number): Promise<IPayment[]> {
    const records = await db.select().from(payment).where(and(
      eq(payment.memberId, memberId),
      eq(payment.organizationId, organizationId)
    ))
    return records as unknown as IPayment[]
  },

  async updateStatus(organizationId: string, id: number, status: 'processing' | 'validated' | 'invalid' | 'voided'): Promise<IPayment | undefined> {
    const updated = await db
      .update(payment)
      .set({ status })
      .where(and(eq(payment.id, id), eq(payment.organizationId, organizationId)))
      .returning()
    return updated[0] as unknown as IPayment | undefined
  },

  async findByIdDetailed(organizationId: string, id: number) {
    return db.query.payment.findFirst({
      where: and(eq(payment.id, id), eq(payment.organizationId, organizationId)),
      with: {
        member: true,
        subscription: true,
        organization: true
      }
    })
  },

  async getAggregatedPayments(organizationId: string, startDate: Date) {
    return db
      .select({
        day: sql<string>`DATE_TRUNC('day', ${payment.paymentDate})`,
        currency: payment.currencyPaid,
        amount: sql<number>`SUM(${payment.amountPaid})`,
        exchangeRate: payment.exchangeRateApplied,
      })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId),
        eq(payment.status, 'validated'),
        sql`${payment.paymentDate} >= ${startDate}`
      ))
      .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
      .orderBy(sql`1`);
  },

  async getAggregatedPaymentsMonthly(organizationId: string, startDate: Date) {
    return db
      .select({
        month: sql<string>`DATE_TRUNC('month', ${payment.paymentDate})`,
        currency: payment.currencyPaid,
        amount: sql<number>`SUM(${payment.amountPaid})`,
        exchangeRate: payment.exchangeRateApplied,
      })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId),
        eq(payment.status, 'validated'),
        sql`${payment.paymentDate} >= ${startDate}`
      ))
      .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
      .orderBy(sql`1`);
  },

  async getPendingPaymentsCount(organizationId: string) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId),
        eq(payment.status, 'processing')
      ));
    return result[0]?.count || 0;
  },

  async getPaymentsByMethod(organizationId: string, startDate: Date) {
    return db
      .select({
        paymentMethod: payment.paymentMethod,
        currencyPaid: payment.currencyPaid,
        totalAmount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId),
        eq(payment.status, 'validated'),
        sql`${payment.paymentDate} >= ${startDate}`
      ))
      .groupBy(payment.paymentMethod, payment.currencyPaid)
      .orderBy(sql`count(*) DESC`);
  }
}
