import { apiClient } from "../api-client";
import { ICoach, CoachFilter, PaginatedCoaches } from "@/types/dashboard";

/**
 * Service to handle coach-related API operations.
 */
export const coachesService = {
  /**
   * Fetches all coaches from the API with optional filters and pagination.
   */
  async getCoaches(filters: CoachFilter = {}): Promise<PaginatedCoaches> {
    const response = await apiClient.get<PaginatedCoaches>("/coaches", {
      params: filters,
    });
    return response.data;
  },

  /**
   * Deletes a coach by its ID.
   */
  async deleteCoach(id: number): Promise<void> {
    await apiClient.delete(`/coaches/${id}`);
  },

  /**
   * Creates a new coach.
   */
  async createCoach(data: Partial<ICoach>): Promise<ICoach> {
    const response = await apiClient.post<ICoach>("/coaches", data);
    return response.data;
  },

  /**
   * Updates an existing coach.
   */
  async updateCoach(id: number, data: Partial<ICoach>): Promise<ICoach> {
    const response = await apiClient.put<ICoach>(`/coaches/${id}`, data);
    return response.data;
  },

};

/**
 * ─────────────────────────────────────────────
 * COACH MUTATION HOOKS
 * ─────────────────────────────────────────────
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@workspace/ui/components";

/**
 * Hook to create a coach.
 */
export function useCreateCoachMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ICoach>) => coachesService.createCoach(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coaches"] });
      toast.success("Entrenador creado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al crear entrenador";
      toast.error(message);
    }
  });
}

/**
 * Hook to update a coach (including visibility).
 */
export function useUpdateCoachMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ICoach> }) => 
      coachesService.updateCoach(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coaches"] });
      toast.success("Entrenador actualizado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al actualizar entrenador";
      toast.error(message);
    }
  });
}

/**
 * Hook to delete a coach.
 */
export function useDeleteCoachMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => coachesService.deleteCoach(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coaches"] });
      toast.success("Entrenador eliminado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar entrenador";
      toast.error(message);
    }
  });
}

