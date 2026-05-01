import { settingsRepository } from '../repositories/settings.repository'
import { platformSettingsRepository } from '../repositories/platform-settings.repository'
import { OrganizationDateManager } from '../lib/date-manager'

export const settingsService = {
  async getByKey(organizationId: string | null, key: string): Promise<string | undefined> {
    if (!organizationId) {
      return platformSettingsRepository.findByKey(key);
    }
    return settingsRepository.findByKey(organizationId, key)
  },

  async upsert(organizationId: string | null, key: string, value: string): Promise<void> {
    if (!key) throw new Error('Se requiere una clave para la configuración')
    
    if (!organizationId) {
      return platformSettingsRepository.upsert(key, value);
    }
    return settingsRepository.upsert(organizationId, key, value)
  },

  async getAll(organizationId: string | null): Promise<Record<string, string>> {
    if (!organizationId) {
      return platformSettingsRepository.getAll();
    }
    return settingsRepository.getAll(organizationId)
  },

  async updateAll(organizationId: string | null, settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.upsert(organizationId, key, value);
    }
  },

  /**
   * Factory method to get a DateManager for a specific organization.
   */
  async getDateManager(organizationId: string | null): Promise<OrganizationDateManager> {
    const timezone = (await this.getByKey(organizationId, 'timezone')) || 'America/Caracas';
    return new OrganizationDateManager(timezone);
  },


  async parseLocalDate(organizationId: string | null, dateStr: string): Promise<Date> {
    const manager = await this.getDateManager(organizationId);
    return manager.parseLocalToUtc(dateStr);
  }
}
