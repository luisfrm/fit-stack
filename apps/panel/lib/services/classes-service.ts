import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { ICmsClass } from "@workspace/shared/types";

export interface ClassesFilter {
  name?: string;
  trainerName?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  date?: string;
}

export interface PaginatedClasses {
  data: ICmsClass[];
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
  ): Promise<ICmsClass[]> {
    return await api<ICmsClass[]>(CLASSES_PATH, {
      query: { date },
      ...options,
    });
  },

  async deleteClass(id: number): Promise<void> {
    await api(`${CLASSES_PATH}/${id}`, { method: "DELETE" });
  },

  async createClass(data: Partial<ICmsClass>): Promise<ICmsClass> {
    return await api<ICmsClass>(CLASSES_PATH, {
      method: "POST",
      body: data,
    });
  },

  async updateClass(
    id: number,
    data: Partial<ICmsClass>,
  ): Promise<ICmsClass> {
    return await api<ICmsClass>(`${CLASSES_PATH}/${id}`, {
      method: "PUT",
      body: data,
    });
  },
};
