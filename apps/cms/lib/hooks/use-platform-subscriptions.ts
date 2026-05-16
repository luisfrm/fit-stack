"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { PlatformSubscriptionStatus } from "@workspace/shared/types";

export function usePlatformSubscriptionStats() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["platform-subscriptions-stats"],
    queryFn: () => platformSubscriptionsService.getStats(),
    staleTime: 60_000,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      platformSubscriptionsService.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions-stats"] });
    },
  });
}

export function useExtendSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newEndDate }: { id: number; newEndDate: string }) =>
      platformSubscriptionsService.extend(id, newEndDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions-stats"] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => platformSubscriptionsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["platform-subscriptions-stats"] });
    },
  });
}