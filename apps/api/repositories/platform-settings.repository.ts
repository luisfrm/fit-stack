import { db, eq } from '@workspace/database/client'
import { platformSetting } from '@workspace/database/schema'

export const platformSettingsRepository = {
  async findByKey(key: string): Promise<string | undefined> {
    const records = await db.select().from(platformSetting).where(eq(platformSetting.key, key))
    return records[0]?.value
  },

  async upsert(key: string, value: string): Promise<void> {
    const existing = await this.findByKey(key)
    if (existing === undefined) {
      await db.insert(platformSetting).values({ key, value })
    } else {
      await db
        .update(platformSetting)
        .set({ value, updatedAt: new Date() })
        .where(eq(platformSetting.key, key))
    }
  },

  async getAll(): Promise<Record<string, string>> {
    const records = await db.select().from(platformSetting)
    return records.reduce((acc, curr) => {
      acc[curr.key] = curr.value
      return acc
    }, {} as Record<string, string>)
  },
}
