"use client";

import { useQuery } from "@tanstack/react-query";
import { subscriptionsService } from "../services/subscriptions-service";
import { type IRecentRegistration } from "@/types/dashboard";

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
