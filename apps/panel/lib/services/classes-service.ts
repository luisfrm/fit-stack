import { apiClient } from "../api-client";
import { ICmsClass } from "@/types/dashboard";

export interface ClassesFilter {
  name?: string;
  trainerName?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedClasses {
  data: ICmsClass[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Service to handle class-related API operations.
 */
export const classesService = {
  /**
   * Fetches all classes from the API with optional filters and pagination.
   */
  async getClasses(filters: ClassesFilter = {}): Promise<PaginatedClasses> {
    const response = await apiClient.get<PaginatedClasses>("/classes", {
      params: filters,
    });
    return response.data;
  },

  /**
   * Fetches classes for a specific date (for the dashboard 'Today' widget).
   * Returns 'once' classes whose scheduledDate matches and 'weekly' classes
   * whose daysOfWeek includes the respective day-of-week.
   */
  async getClassesByDate(date: string): Promise<ICmsClass[]> {
    const response = await apiClient.get<ICmsClass[]>('/classes', {
      params: { date },
    });
    return response.data;
  },

  /**
   * Deletes a class by its ID.
   */
  async deleteClass(id: number): Promise<void> {
    await apiClient.delete(`/classes/${id}`);
  },

  /**
   * Creates a new class.
   */
  async createClass(data: Partial<ICmsClass>): Promise<ICmsClass> {
    const response = await apiClient.post<ICmsClass>("/classes", data);
    return response.data;
  },

  /**
   * Updates an existing class.
   */
  async updateClass(id: number, data: Partial<ICmsClass>): Promise<ICmsClass> {
    const response = await apiClient.put<ICmsClass>(`/classes/${id}`, data);
    return response.data;
  },
};
