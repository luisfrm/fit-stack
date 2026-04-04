import { settingsRepository } from '../repositories/settings.repository'

/**
 * Service to manage global gym settings.
 */
export const settingsService = {
  /**
   * Retrieves a setting value by its key.
   */
  async getByKey(key: string): Promise<string | undefined> {
    return settingsRepository.findByKey(key)
  },

  /**
   * Upserts a setting (creates if not exists, updates if it does).
   */
  async upsert(key: string, value: string): Promise<void> {
    if (!key) throw new Error('Se requiere una clave para la configuración')
    return settingsRepository.upsert(key, value)
  },

  /**
   * Retrieves all dictionary of settings.
   */
  async getAll(): Promise<Record<string, string>> {
    return settingsRepository.getAll()
  },

  /**
   * Resolves the current "Wall Clock" date/time for the gym 
   * based on its configured timezone setting.
   */
  async getGymNow(): Promise<Date> {
    const timezone = (await this.getByKey('timezone')) || 'America/Caracas';
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

    // Return a Date where the "UTC" values match the Gym's "Local" wall clock.
    // This allows direct comparison with naive 'timestamp' database fields.
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
