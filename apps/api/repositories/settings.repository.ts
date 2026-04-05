import { db, eq, and } from '@workspace/database/client'
import { gymSetting } from '@workspace/database/schema'

export interface IGymSetting {
  id?: number
  organizationId: string
  key: string
  value: string
  createdAt?: string | Date
  updatedAt?: string | Date
}

export const settingsRepository = {
  async findByKey(organizationId: string, key: string): Promise<string | undefined> {
    const records = await db.select().from(gymSetting).where(and(
      eq(gymSetting.key, key),
      eq(gymSetting.organizationId, organizationId)
    ))
    return records[0]?.value
  },

  async upsert(organizationId: string, key: string, value: string): Promise<void> {
    const existing = await this.findByKey(organizationId, key)
    if (existing === undefined) {
      await db.insert(gymSetting).values({ organizationId, key, value })
    } else {
      await db
        .update(gymSetting)
        .set({ value, updatedAt: new Date() })
        .where(and(
          eq(gymSetting.key, key),
          eq(gymSetting.organizationId, organizationId)
        ))
    }
  },

  async getAll(organizationId: string): Promise<Record<string, string>> {
    const records = await db.select().from(gymSetting).where(eq(gymSetting.organizationId, organizationId))
    return records.reduce((acc, curr) => {
      acc[curr.key] = curr.value
      return acc
    }, {} as Record<string, string>)
  }
}
