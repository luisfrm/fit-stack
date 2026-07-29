import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IGymClass } from "@workspace/shared/types";

export interface ClassesFilter {
  name?: string;
  trainerName?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  date?: string;
}

export interface PaginatedClasses {
  data: IGymClass[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const CLASSES_PATH = "/classes";

/**
 * Service to handle class-related API operations.
 */
export const classesService = {
  async getClasses(
    filters: ClassesFilter = {},
    options?: ApiFetchOptions,
  ): Promise<PaginatedClasses> {
    return await api<PaginatedClasses>(CLASSES_PATH, {
      query: filters,
      ...options,
    });
  },

  async getClassesByDate(
    date: string,
    options?: ApiFetchOptions,
  ): Promise<IGymClass[]> {
    return await api<IGymClass[]>(CLASSES_PATH, {
      query: { date },
      ...options,
    });
  },

  async deleteClass(id: number): Promise<void> {
    await api(`${CLASSES_PATH}/${id}`, { method: "DELETE" });
  },

  async createClass(data: Partial<IGymClass>): Promise<IGymClass> {
    return await api<IGymClass>(CLASSES_PATH, {
      method: "POST",
      body: data,
    });
  },

  async updateClass(
    id: number,
    data: Partial<IGymClass>,
  ): Promise<IGymClass> {
    return await api<IGymClass>(`${CLASSES_PATH}/${id}`, {
      method: "PUT",
      body: data,
    });
  },
};
