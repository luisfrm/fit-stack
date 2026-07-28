import { apiClient } from '../api-client'
import { IMembershipPlan, IMembershipsSummary } from '@/types/dashboard'

export const plansService = {
  getAll: async (options?: { includeStats?: boolean }): Promise<IMembershipPlan[]> => {
    const params = options?.includeStats ? { includeStats: true } : {}
    const { data } = await apiClient.get<IMembershipPlan[]>('/plans', { params })
    return data
  },

  getSummary: async (): Promise<IMembershipsSummary> => {
    const { data } = await apiClient.get<IMembershipsSummary>('/plans/summary')
    return data
  },

  create: async (plan: Omit<IMembershipPlan, 'id'>): Promise<IMembershipPlan> => {
    const { data } = await apiClient.post<IMembershipPlan>('/plans', plan)
    return data
  },

  update: async (id: number, plan: Partial<IMembershipPlan>): Promise<IMembershipPlan> => {
    const { data } = await apiClient.put<IMembershipPlan>(`/plans/${id}`, plan)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/plans/${id}`)
  }
}
