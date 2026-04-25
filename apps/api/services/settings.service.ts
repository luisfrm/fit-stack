import { settingsRepository } from '../repositories/settings.repository'
import { platformSettingsRepository } from '../repositories/platform-settings.repository'

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

  async getGymNow(organizationId: string | null): Promise<Date> {
    const timezone = (await this.getByKey(organizationId, 'timezone')) || 'America/Caracas';
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const partValue = (type: string) => parts.find((p) => p.type === type)?.value || '0';

    return new Date(Date.UTC(
      Number.parseInt(partValue('year'), 10),
      Number.parseInt(partValue('month'), 10) - 1,
      Number.parseInt(partValue('day'), 10),
      Number.parseInt(partValue('hour'), 10),
      Number.parseInt(partValue('minute'), 10),
      Number.parseInt(partValue('second'), 10)
    ));
  },

  async parseLocalDate(organizationId: string | null, dateStr: string): Promise<Date> {
    const timezone = (await this.getByKey(organizationId, 'timezone')) || 'America/Caracas';
    
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    }).formatToParts(new Date(dateStr));
    
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    const offset = offsetPart.replace('GMT', '');
    
    const finalOffset = offset === '' ? '+00:00' : (!offset.includes(':') ? `${offset[0]}${offset.slice(1).padStart(2, '0')}:00` : offset);
    
    return new Date(`${dateStr}T00:00:00${finalOffset}`);
  }
}
