import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IPlatformOrganization } from "@workspace/shared/types";

const ORGANIZATIONS_PATH = "/platform/organizations";

/**
 * Platform-level organization management, used from the panel ONLY to join /
 * list organizations (org discovery at sign-in).
 *
 * ⚠️ NO agregar `update` aquí: `PATCH /api/platform/organizations/:id` exige
 * `requirePlatformAuth` (permiso de plataforma `organization.create`), así que
 * un owner/manager de gym recibe 403. La escritura de la fila `organization`
 * desde el panel vive en `orgProfileService` (`PATCH /api/organizations/profile`,
 * org-scoped) — ver AGENTS.md §5.
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

  async join(id: string): Promise<void> {
    await api(`${ORGANIZATIONS_PATH}/${id}/join`, { method: "POST" });
  },
};
