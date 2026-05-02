import { apiClient } from '../api-client'
import { ISubscription, SubscriptionStatus, PaginatedSubscriptions, SubscriptionsFilter } from '@/types/dashboard'

export const subscriptionsService = {
  getAll: async (params?: SubscriptionsFilter): Promise<PaginatedSubscriptions> => {
    const { data } = await apiClient.get<PaginatedSubscriptions>('/subscriptions', { params })
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
  },

  getRecent: async (limit: number = 5): Promise<Array<{ id: number; name: string; createdAt: string }>> => {
    const { data } = await apiClient.get<Array<{ id: number; name: string; createdAt: string }>>('/subscriptions/recent', {
      params: { limit }
    })
    return data
  }
}
