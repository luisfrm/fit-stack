import { eq, type Db } from '@workspace/database/factory';
import { platformSetting } from '@workspace/database/schema';

export function createPlatformSettingsRepository(db: Db) {
  return {
    async findByKey(key: string): Promise<string | undefined> {
      const records = await db.select().from(platformSetting).where(eq(platformSetting.key, key));
      return records[0]?.value;
    },

    async upsert(key: string, value: string): Promise<void> {
      const existing = await this.findByKey(key);
      if (existing === undefined) {
        await db.insert(platformSetting).values({ key, value });
      } else {
        await db
          .update(platformSetting)
          .set({ value, updatedAt: new Date() })
          .where(eq(platformSetting.key, key));
      }
    },

    async getAll(): Promise<Record<string, string>> {
      const records = await db.select().from(platformSetting);
      return records.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);
    },

    /**
     * Reference currency of the platform (`platform_setting.primary_currency`,
     * seeded by `/api/init`). Every SaaS amount is normalized to it, so a
     * missing value is a visible error: it is never defaulted.
     */
    async getPrimaryCurrency(): Promise<string> {
      const value = await this.findByKey('primary_currency');
      if (!value) {
        throw new Error(
          'platform_setting.primary_currency is missing: SaaS amounts cannot be normalized without it.',
        );
      }
      return value;
    },
  };
}

export type PlatformSettingsRepository = ReturnType<typeof createPlatformSettingsRepository>;
