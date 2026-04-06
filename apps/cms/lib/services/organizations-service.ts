import { apiClient } from "../api-client";
import { type Organization } from "@/components/dashboard/organization-mobile-card";

interface OrganizationFilter {
  query?: string;
  page?: number;
  limit?: number;
}

interface PaginatedOrganizations {
  data: Organization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Service to handle organization-related API operations for SaaS Admins.
 */
export const organizationsService = {
  /**
   * Fetches all organizations from the platform with optional filters.
   */
  async getOrganizations(filters: OrganizationFilter = {}): Promise<PaginatedOrganizations> {
    const response = await apiClient.get<PaginatedOrganizations>("/organizations", {
      params: filters,
    });
    return response.data;
  },

  /**
   * Creates a new organization.
   */
  async createOrganization(data: Partial<Organization>): Promise<Organization> {
    const response = await apiClient.post<Organization>("/organizations", data);
    return response.data;
  },

  /**
   * Updates an existing organization.
   */
  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const response = await apiClient.put<Organization>(`/organizations/${id}`, data);
    return response.data;
  },

  /**
   * Special action to update status independently if needed.
   */
  async updateStatus(id: string, status: Organization['status']): Promise<void> {
    await apiClient.patch(`/organizations/${id}/status`, { status });
  }
};
