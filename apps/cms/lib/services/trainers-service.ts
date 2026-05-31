import { apiClient } from "../api-client";
import { ITrainer, TrainerFilter, PaginatedTrainers } from "@/types/dashboard";

/**
 * Service to handle trainer-related API operations.
 */
export const trainersService = {
  /**
   * Fetches all trainers from the API with optional filters and pagination.
   */
  async getTrainers(filters: TrainerFilter = {}): Promise<PaginatedTrainers> {
    const response = await apiClient.get<PaginatedTrainers>("/trainers", {
      params: filters,
    });
    return response.data;
  },

  /**
   * Deletes a trainer by its ID.
   */
  async deleteTrainer(id: number): Promise<void> {
    await apiClient.delete(`/trainers/${id}`);
  },

  /**
   * Creates a new trainer.
   */
  async createTrainer(data: Partial<ITrainer>): Promise<ITrainer> {
    const response = await apiClient.post<ITrainer>("/trainers", data);
    return response.data;
  },

  /**
   * Updates an existing trainer.
   */
  async updateTrainer(id: number, data: Partial<ITrainer>): Promise<ITrainer> {
    const response = await apiClient.put<ITrainer>(`/trainers/${id}`, data);
    return response.data;
  },

};

/**
 * ─────────────────────────────────────────────
 * TRAINER MUTATION HOOKS
 * ─────────────────────────────────────────────
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@workspace/ui/components";

/**
 * Hook to create a trainer.
 */
export function useCreateTrainerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ITrainer>) => trainersService.createTrainer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Entrenador creado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al crear entrenador";
      toast.error(message);
    }
  });
}

/**
 * Hook to update a trainer (including visibility).
 */
export function useUpdateTrainerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ITrainer> }) =>
      trainersService.updateTrainer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Entrenador actualizado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al actualizar entrenador";
      toast.error(message);
    }
  });
}

/**
 * Hook to delete a trainer.
 */
export function useDeleteTrainerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => trainersService.deleteTrainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Entrenador eliminado correctamente");
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar entrenador";
      toast.error(message);
    }
  });
}