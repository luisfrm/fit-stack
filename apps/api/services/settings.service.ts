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
  }
}
