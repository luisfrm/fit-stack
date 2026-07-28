import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IPlatformOrganization } from "@workspace/shared/types";

const ORGANIZATIONS_PATH = "/platform/organizations";

/**
 * Service for platform-level organization management (used by panel owner).
 */
export const organizationsService = {
  async getAll(
    params?: { query?: string; page?: number; limit?: number },
    options?: ApiFetchOptions,
  ): Promise<{ data: IPlatformOrganization[]; total: number; totalPages: number }> {
    return await api(ORGANIZATIONS_PATH, {
      query: params,
      ...options,
    });
  },

  async getById(
    id: string,
    options?: ApiFetchOptions,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(
      `${ORGANIZATIONS_PATH}/${id}`,
      options,
    );
  },

  async update(
    id: string,
    data: Partial<IPlatformOrganization>,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(`${ORGANIZATIONS_PATH}/${id}`, {
      method: "PATCH",
      body: data,
    });
  },

  async join(id: string): Promise<void> {
    await api(`${ORGANIZATIONS_PATH}/${id}/join`, { method: "POST" });
  },
};
