import { db, eq, and } from '@workspace/database/client'
import { payments } from '@workspace/database/schema'

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
    const inserted = await db.insert(payments).values({
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
    const records = await db.select().from(payments).where(and(
      eq(payments.subscriptionId, subscriptionId),
      eq(payments.organizationId, organizationId)
    ))
    return records[0] as unknown as IPayment | undefined
  },

  async findByMemberId(organizationId: string, memberId: number): Promise<IPayment[]> {
    const records = await db.select().from(payments).where(and(
      eq(payments.memberId, memberId),
      eq(payments.organizationId, organizationId)
    ))
    return records as unknown as IPayment[]
  }
}
