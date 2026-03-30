import { apiClient } from '../api-client'
import { IMembershipPlan } from '@/types/dashboard'

export const plansService = {
  getAll: async (): Promise<IMembershipPlan[]> => {
    const { data } = await apiClient.get<IMembershipPlan[]>('/plans')
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
