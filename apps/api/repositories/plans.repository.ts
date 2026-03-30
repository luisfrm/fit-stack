import { db, eq } from '@workspace/database/client'
import { membershipPlans } from '@workspace/database/schema'

export interface IMembershipPlan {
  id?: number
  name: string
  price: number
  features: string[] | null
  isPopular: boolean
  isVisibleOnSite: boolean
}

export const plansRepository = {
  async findAll(): Promise<IMembershipPlan[]> {
    const records = await db.select().from(membershipPlans).orderBy(membershipPlans.id)
    return records as unknown as IMembershipPlan[]
  },

  async findById(id: number): Promise<IMembershipPlan | undefined> {
    const records = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id))
    return records[0] as IMembershipPlan | undefined
  },

  async create(data: Omit<IMembershipPlan, 'id'>): Promise<IMembershipPlan> {
    const inserted = await db.insert(membershipPlans).values({
      name: data.name,
      price: data.price,
      features: data.features,
      isPopular: data.isPopular,
      isVisibleOnSite: data.isVisibleOnSite,
    }).returning()
    return inserted[0] as IMembershipPlan
  },

  async update(id: number, data: Partial<IMembershipPlan>): Promise<IMembershipPlan> {
    const updated = await db
      .update(membershipPlans)
      .set({
        name: data.name,
        price: data.price,
        features: data.features,
        isPopular: data.isPopular,
        isVisibleOnSite: data.isVisibleOnSite,
      })
      .where(eq(membershipPlans.id, id))
      .returning()
    return updated[0] as IMembershipPlan
  },

  async delete(id: number): Promise<void> {
    await db.delete(membershipPlans).where(eq(membershipPlans.id, id))
  }
}
