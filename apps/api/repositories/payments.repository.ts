import { db, eq, and } from '@workspace/database/client'
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
        subscription: true
      }
    })
  }
}
