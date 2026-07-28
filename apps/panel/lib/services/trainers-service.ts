import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { ITrainer, TrainerFilter, PaginatedTrainers } from "@workspace/shared/types";

const TRAINERS_PATH = "/trainers";

/**
 * Service to handle trainer-related API operations.
 */
export const trainersService = {
  async getTrainers(
    filters: TrainerFilter = {},
    options?: ApiFetchOptions,
  ): Promise<PaginatedTrainers> {
    return await api<PaginatedTrainers>(TRAINERS_PATH, {
      query: filters,
      ...options,
    });
  },

  async deleteTrainer(id: number): Promise<void> {
    await api(`${TRAINERS_PATH}/${id}`, { method: "DELETE" });
  },

  async createTrainer(
    data: Partial<ITrainer>,
  ): Promise<ITrainer> {
    return await api<ITrainer>(TRAINERS_PATH, {
      method: "POST",
      body: data,
    });
  },

  async updateTrainer(
    id: number,
    data: Partial<ITrainer>,
  ): Promise<ITrainer> {
    return await api<ITrainer>(`${TRAINERS_PATH}/${id}`, {
      method: "PUT",
      body: data,
    });
  },
};
