import { apiClient } from "../api-client";
import { ICmsClass } from "@/types/dashboard";

/**
 * Service to handle class-related API operations.
 */
export const classesService = {
  /**
   * Fetches all classes from the API.
   */
  async getClasses(): Promise<ICmsClass[]> {
    const response = await apiClient.get<ICmsClass[]>("/api/classes");
    return response.data;
  },

  /**
   * Deletes a class by its ID.
   */
  async deleteClass(id: number): Promise<void> {
    await apiClient.delete(`/api/classes/${id}`);
  },

  /**
   * Creates a new class.
   */
  async createClass(data: Partial<ICmsClass>): Promise<ICmsClass> {
    const response = await apiClient.post<ICmsClass>("/api/classes", data);
    return response.data;
  },

  /**
   * Updates an existing class.
   */
  async updateClass(id: number, data: Partial<ICmsClass>): Promise<ICmsClass> {
    const response = await apiClient.put<ICmsClass>(`/api/classes/${id}`, data);
    return response.data;
  },
};
