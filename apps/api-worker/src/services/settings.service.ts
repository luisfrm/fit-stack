import type { SettingsRepository } from '../repositories/settings.repository';
import type { PlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { OrganizationDateManager } from '../lib/date-manager';

export function createSettingsService(
  settingsRepo: SettingsRepository,
  platformSettingsRepo: PlatformSettingsRepository
) {
  return {
    async getByKey(organizationId: string | null, key: string): Promise<string | undefined> {
      if (!organizationId) {
        return platformSettingsRepo.findByKey(key);
      }
      return settingsRepo.findByKey(organizationId, key);
    },

    async upsert(organizationId: string | null, key: string, value: string): Promise<void> {
      if (!key) throw new Error('Se requiere una clave para la configuración');

      if (!organizationId) {
        return platformSettingsRepo.upsert(key, value);
      }
      return settingsRepo.upsert(organizationId, key, value);
    },

    async getAll(organizationId: string | null): Promise<Record<string, string>> {
      if (!organizationId) {
        return platformSettingsRepo.getAll();
      }
      return settingsRepo.getAll(organizationId);
    },

    async updateAll(organizationId: string | null, settings: Record<string, string>): Promise<void> {
      for (const [key, value] of Object.entries(settings)) {
        await this.upsert(organizationId, key, value);
      }
    },

    getDateManager(timezone: string = 'America/Caracas'): OrganizationDateManager {
      return new OrganizationDateManager(timezone);
    },

    async parseLocalDate(timezone: string, dateStr: string): Promise<Date> {
      const manager = this.getDateManager(timezone);
      return manager.parseLocalToUtc(dateStr);
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
