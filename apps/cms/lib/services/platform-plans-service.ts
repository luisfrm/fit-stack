import { apiClient } from "@/lib/api-client";
import { IPlatformPlan } from "@workspace/shared/types";

const PLATFORM_PLANS_PATH = "/platform/plans";

export const platformPlansService = {
  async getAll(): Promise<IPlatformPlan[]> {
    const response = await apiClient.get(PLATFORM_PLANS_PATH);
    return response.data;
  },

  async getById(id: number): Promise<IPlatformPlan> {
    const response = await apiClient.get(`${PLATFORM_PLANS_PATH}/${id}`);
    return response.data;
  },

  async create(data: Omit<IPlatformPlan, "id" | "createdAt">): Promise<IPlatformPlan> {
    const response = await apiClient.post(PLATFORM_PLANS_PATH, data);
    return response.data;
  },

  async update(id: number, data: Partial<IPlatformPlan>): Promise<IPlatformPlan> {
    const response = await apiClient.patch(`${PLATFORM_PLANS_PATH}/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${PLATFORM_PLANS_PATH}/${id}`);
  }
};
