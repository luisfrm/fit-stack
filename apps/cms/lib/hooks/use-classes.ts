"use client";

import { useQuery } from "@tanstack/react-query";
import { classesService } from "../services/classes-service";
import { type IClassToday } from "@/types/dashboard";

/**
 * Hook to fetch classes for a specific date (Today's widget).
 * Includes automatic mapping and sorting by start time.
 */
export function useTodayClasses(date: string) {
  return useQuery<IClassToday[]>({
    queryKey: ["classes", "today", date],
    queryFn: async () => {
      const raw = await classesService.getClassesByDate(date);
      const mapped: IClassToday[] = raw.map((cls) => ({
        id: cls.id,
        name: cls.name,
        startTime: cls.startTime,
        endTime: cls.endTime,
        trainerName: cls.trainerName,
        capacity: cls.capacity,
      }));
      return mapped.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
