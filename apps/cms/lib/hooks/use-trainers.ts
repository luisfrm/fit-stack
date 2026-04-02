import { useQuery } from "@tanstack/react-query";
import { coachesService } from "../services/coaches-service";
import { type CoachFilter, type PaginatedCoaches } from "@/types/dashboard";

/**
 * Hook to fetch coaches with caching.
 * @param filters Filters for searching and pagination
 */
export function useCoaches(filters: CoachFilter = {}) {
  return useQuery<PaginatedCoaches>({
    queryKey: ["coaches", filters],
    queryFn: () => coachesService.getCoaches(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes for general list
  });
}
