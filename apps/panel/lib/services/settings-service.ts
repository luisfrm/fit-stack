import { apiClient } from '../api-client'

export const settingsService = {
  getByKey: async (key: string): Promise<string | undefined> => {
    try {
      const { data } = await apiClient.get<{ value: string }>(`/settings/${key}`)
      return data.value
    } catch {
      return undefined
    }
  },

  getAll: async (): Promise<Record<string, string>> => {
    const { data } = await apiClient.get<Record<string, string>>('/settings')
    return data
  }
}
