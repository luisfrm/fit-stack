import { apiClient } from "../api-client";
import { IMember, MemberFilter, PaginatedMembers } from "@/types/dashboard";

/**
 * Service to handle member-related API operations using axios.
 */
export const membersService = {
  /**
   * Fetches all members from the API with optional filters and pagination.
   */
  async getMembers(filters: MemberFilter = {}): Promise<PaginatedMembers> {
    const response = await apiClient.get<PaginatedMembers>("/api/members", {
      params: filters,
    });
    return response.data;
  },

  /**
   * Deletes a member by its ID.
   */
  async deleteMember(id: number): Promise<void> {
    await apiClient.delete(`/api/members/${id}`);
  },

  /**
   * Creates a new member.
   * Features a flag to trigger the registration email link.
   */
  async createMember(data: Partial<IMember>, sendInvite: boolean = false): Promise<IMember> {
    const response = await apiClient.post<IMember>("/api/members", {
      ...data,
      sendInvite
    });
    return response.data;
  },

  /**
   * Updates an existing member.
   */
  async updateMember(id: number, data: Partial<IMember>): Promise<IMember> {
    const response = await apiClient.put<IMember>(`/api/members/${id}`, data);
    return response.data;
  },

  /**
   * Validates a registration token for a new member.
   */
  async validateToken(token: string): Promise<{ valid: boolean; email: string; firstName: string; lastName: string; }> {
    const response = await apiClient.get(`/api/members/validate-token?token=${token}`);
    return response.data;
  },

  /**
   * Links an authenticated user to an existing member record using a token.
   */
  async linkUser(token: string): Promise<{ success: boolean }> {
    const response = await apiClient.post("/api/members/link-user", { token });
    return response.data;
  }
};
