import { apiClient } from "@/lib/api-client";
import { IPlatformOrganization, IPlatformSubscription } from "@workspace/shared/types";

const ORGANIZATIONS_PATH = "/platform/organizations";

export interface PaginatedOrganizationsResult {
  data: IPlatformOrganization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const organizationsService = {
  async getAll(params?: { 
    query?: string; 
    page?: number; 
    limit?: number; 
    includeMemberCount?: boolean;
  }): Promise<PaginatedOrganizationsResult> {
    const response = await apiClient.get(ORGANIZATIONS_PATH, { params });
    return response.data;
  },

  async getById(id: string): Promise<IPlatformOrganization> {
    const response = await apiClient.get(`${ORGANIZATIONS_PATH}/${id}`);
    return response.data;
  },

  async create(data: Partial<IPlatformOrganization>): Promise<IPlatformOrganization> {
    const response = await apiClient.post(ORGANIZATIONS_PATH, data);
    return response.data;
  },

  async update(id: string, data: Partial<IPlatformOrganization>): Promise<IPlatformOrganization> {
    const response = await apiClient.patch(`${ORGANIZATIONS_PATH}/${id}`, data);
    return response.data;
  },

  async addSubscription(id: string, data: {
    planId: number;
    startDate: string;
    endDate: string;
    isTrial: boolean;
    priceOverride?: string;
  }): Promise<IPlatformSubscription> {
    const response = await apiClient.post(`${ORGANIZATIONS_PATH}/${id}/subscriptions`, data);
    return response.data;
  },

  async join(id: string): Promise<void> {
    await apiClient.post(`${ORGANIZATIONS_PATH}/${id}/join`);
  },

  async provisionOwner(id: string, data: any, sendInvite: boolean = false): Promise<any> {
    const response = await apiClient.post(`${ORGANIZATIONS_PATH}/${id}/staff`, {
      ...data,
      sendInvite
    });
    return response.data;
  }
};
