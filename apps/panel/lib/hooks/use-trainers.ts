import { useQuery } from "@tanstack/react-query";
import { trainersService } from "../services/trainers-service";
import { type TrainerFilter, type PaginatedTrainers } from "@/types/dashboard";

/**
 * Hook to fetch trainers with caching.
 * @param filters Filters for searching and pagination
 */
export function useTrainers(filters: TrainerFilter = {}) {
  return useQuery<PaginatedTrainers>({
    queryKey: ["trainers", filters],
    queryFn: () => trainersService.getTrainers(filters),
    staleTime: 1000 * 60 * 5,
  });
}