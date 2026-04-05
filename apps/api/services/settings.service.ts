import { settingsRepository } from '../repositories/settings.repository'

export const settingsService = {
  async getByKey(organizationId: string, key: string): Promise<string | undefined> {
    return settingsRepository.findByKey(organizationId, key)
  },

  async upsert(organizationId: string, key: string, value: string): Promise<void> {
    if (!key) throw new Error('Se requiere una clave para la configuración')
    return settingsRepository.upsert(organizationId, key, value)
  },

  async getAll(organizationId: string): Promise<Record<string, string>> {
    return settingsRepository.getAll(organizationId)
  },

  async updateAll(organizationId: string, settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.upsert(organizationId, key, value);
    }
  },

  async getGymNow(organizationId: string): Promise<Date> {
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
  }
}
