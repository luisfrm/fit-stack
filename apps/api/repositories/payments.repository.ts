import { db, eq } from '@workspace/database/client'
import { payments } from '@workspace/database/schema'

export interface IPayment {
  id?: number
  memberId: number
  subscriptionId?: number | null
  
  // Snapshots
  planSnapshotName: string
  planSnapshotPrice: number
  planSnapshotCurrency: 'USD' | 'VES' | 'EUR'
  
  // Real Payment
  amountPaid: number
  currencyPaid: 'USD' | 'VES' | 'EUR'
  exchangeRateApplied?: string | null
  
  paymentMethod: 'cash' | 'zelle' | 'pago_movil' | 'pos' | 'other'
  paymentMethodDetails?: string | null
  
  paymentDate?: Date
  createdAt?: Date
}

export const paymentsRepository = {
  async create(data: Omit<IPayment, 'id' | 'createdAt'>): Promise<IPayment> {
    const inserted = await db.insert(payments).values({
      memberId: data.memberId,
      subscriptionId: data.subscriptionId,
      planSnapshotName: data.planSnapshotName,
      planSnapshotPrice: data.planSnapshotPrice,
      planSnapshotCurrency: data.planSnapshotCurrency,
      amountPaid: data.amountPaid,
      currencyPaid: data.currencyPaid,
      exchangeRateApplied: data.exchangeRateApplied,
      paymentMethod: data.paymentMethod,
      paymentMethodDetails: data.paymentMethodDetails,
      paymentDate: data.paymentDate ?? new Date(),
    }).returning()
    return inserted[0] as IPayment
  },

  async findBySubscriptionId(subscriptionId: number): Promise<IPayment | undefined> {
    const records = await db.select().from(payments).where(eq(payments.subscriptionId, subscriptionId))
    return records[0] as IPayment | undefined
  },

  async findByMemberId(memberId: number): Promise<IPayment[]> {
    const records = await db.select().from(payments).where(eq(payments.memberId, memberId))
    return records as IPayment[]
  }
}
