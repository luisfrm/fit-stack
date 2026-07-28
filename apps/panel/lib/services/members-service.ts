import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IMember, MemberFilter, PaginatedMembers } from "@workspace/shared/types";

const MEMBERS_PATH = "/members";

/**
 * Service to handle member-related API operations.
 */
export const membersService = {
  async getMembers(
    filters: MemberFilter = {},
    options?: ApiFetchOptions,
  ): Promise<PaginatedMembers> {
    return await api<PaginatedMembers>(MEMBERS_PATH, {
      query: filters,
      ...options,
    });
  },

  async getCurrentMember(
    options?: ApiFetchOptions,
  ): Promise<IMember | null> {
    try {
      return await api<IMember>(`${MEMBERS_PATH}/me`, options);
    } catch (error) {
      const data = (error as { data?: { code?: string } }).data;
      if (data?.code === "MEMBER_NOT_FOUND") return null;
      throw error;
    }
  },

  async deleteMember(id: number): Promise<void> {
    await api(`${MEMBERS_PATH}/${id}`, { method: "DELETE" });
  },

  async createMember(
    data: Partial<IMember>,
    sendInvite: boolean = false,
  ): Promise<IMember> {
    return await api<IMember>(MEMBERS_PATH, {
      method: "POST",
      body: { ...data, sendInvite },
    });
  },

  async updateMember(
    id: number,
    data: Partial<IMember>,
  ): Promise<IMember> {
    return await api<IMember>(`${MEMBERS_PATH}/${id}`, {
      method: "PUT",
      body: data,
    });
  },

  async validateToken(
    token: string,
  ): Promise<{ valid: boolean; email: string; firstName: string; lastName: string }> {
    return await api(`${MEMBERS_PATH}/validate-token`, {
      query: { token },
    });
  },

  async linkUser(token: string): Promise<{ success: boolean }> {
    return await api(`${MEMBERS_PATH}/link-user`, {
      method: "POST",
      body: { token },
    });
  },

  async resendInvite(id: number): Promise<{ success: boolean }> {
    return await api(`${MEMBERS_PATH}/${id}/resend-invite`, {
      method: "POST",
    });
  },
};
