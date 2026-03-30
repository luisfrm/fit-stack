import { apiClient } from '../api-client'
import { ISubscription, SubscriptionStatus } from '@/types/dashboard'

export const subscriptionsService = {
  getAll: async (): Promise<ISubscription[]> => {
    const { data } = await apiClient.get<ISubscription[]>('/subscriptions')
    return data
  },

  create: async (subscription: Omit<ISubscription, 'id' | 'memberName' | 'planName'>): Promise<ISubscription> => {
    const { data } = await apiClient.post<ISubscription>('/subscriptions', subscription)
    return data
  },

  updateStatus: async (id: number, status: SubscriptionStatus): Promise<ISubscription> => {
    const { data } = await apiClient.put<ISubscription>(`/subscriptions/${id}`, { status })
    return data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/subscriptions/${id}`)
  }
}
