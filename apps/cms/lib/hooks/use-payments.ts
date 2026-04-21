"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsService } from "../services/subscriptions-service";
import { financeService } from "../services/finance-service";
import { type IRecentRegistration, type ISubscription, type SubscriptionsFilter, type PaginatedSubscriptions } from "@/types/dashboard";

/**
 * Hook to fetch all subscriptions with pagination and filters.
 */
export function useSubscriptions(params?: SubscriptionsFilter) {
  return useQuery<PaginatedSubscriptions>({
    queryKey: ["subscriptions", "paginated", params],
    queryFn: () => subscriptionsService.getAll(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Mutation to update payment status (validated, invalid, voided).
 */
export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, status }: { paymentId: number; status: string }) =>
      financeService.updatePaymentStatus(paymentId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["payments", "analytics"] });
    },
  });
}

/**
 * Mutation to update subscription status (active, canceled, expired).
 */
export function useUpdateSubscriptionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      subscriptionsService.updateStatus(id, status as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["payments", "analytics"] });
    },
  });
}

/**
 * Mutation to delete a subscription record.
 */
export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => subscriptionsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["payments", "analytics"] });
    },
  });
}

/**
 * Utility to format relative time (e.g., "Hace 5 min").
 */
function getRelativeTime(dateStr: string) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffInMs = now.getTime() - past.getTime();
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMins < 2) return "Ahora mismo";
  if (diffInMins < 60) return `Hace ${diffInMins} min`;
  if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
  if (diffInDays === 1) return 'Ayer';
  return past.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Hook to fetch recent registrations (sign-ups).
 * Automatically formats the timestamp into relative time.
 */
export function useRecentRegistrations(limit: number = 5) {
  return useQuery<IRecentRegistration[]>({
    queryKey: ["subscriptions", "recent", limit],
    queryFn: async () => {
      const data = await subscriptionsService.getRecent(limit);
      return data.map(sub => ({
        name: sub.name,
        time: getRelativeTime(sub.createdAt),
      }));
    },
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Hook to fetch payments dashboard analytics.
 */
export function useAnalytics(baseCurrency: string) {
  return useQuery({
    queryKey: ["payments", "analytics", baseCurrency],
    queryFn: () => financeService.getAnalytics(baseCurrency),
    enabled: !!baseCurrency,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
