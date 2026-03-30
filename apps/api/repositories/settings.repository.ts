import { db, eq } from '@workspace/database/client'
import { gymSettings } from '@workspace/database/schema'

export interface IGymSetting {
  id?: number
  key: string
  value: string
  createdAt?: Date
  updatedAt?: Date
}

export const settingsRepository = {
  async findByKey(key: string): Promise<string | undefined> {
    const records = await db.select().from(gymSettings).where(eq(gymSettings.key, key))
    return records[0]?.value
  },

  async upsert(key: string, value: string): Promise<void> {
    const existing = await this.findByKey(key)
    if (existing === undefined) {
      await db.insert(gymSettings).values({ key, value })
    } else {
      await db
        .update(gymSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(gymSettings.key, key))
    }
  },

  async getAll(): Promise<Record<string, string>> {
    const records = await db.select().from(gymSettings)
    return records.reduce((acc, curr) => {
      acc[curr.key] = curr.value
      return acc
    }, {} as Record<string, string>)
  }
}
