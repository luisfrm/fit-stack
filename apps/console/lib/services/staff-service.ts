import { api, type ApiFetchOptions } from "@/lib/api/client";

const STAFF_PATH = "/platform/staff";

export interface PlatformStaffMember {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  createdAt: string | Date;
}

export interface CreateStaffInput {
  name?: string;
  email: string;
  role: string;
  sendInvite?: boolean;
}

export interface CreateStaffResult {
  status: "granted" | "invited";
  user?: { id: string; name: string; email: string; role: string };
  email?: string;
  role?: string;
}

/**
 * Service to manage platform staff (SaaS admins) — users with a global
 * platform role (support/admin/owner) that can access FitStack Console.
 */
export const staffService = {
  /**
   * Lists all platform staff members.
   */
  async getAll(options?: ApiFetchOptions): Promise<PlatformStaffMember[]> {
    return await api<PlatformStaffMember[]>(STAFF_PATH, options);
  },

  /**
   * Grants platform access to an existing user (updates their global role)
   * or sends a registration invite (targeting Console) when the user doesn't exist.
   */
  async create(data: CreateStaffInput): Promise<CreateStaffResult> {
    return await api<CreateStaffResult>(STAFF_PATH, {
      method: "POST",
      body: data,
    });
  },

  /**
   * Revokes platform access (role → 'user').
   */
  async revoke(id: string): Promise<{ success: boolean }> {
    return await api<{ success: boolean }>(`${STAFF_PATH}/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Validates a console registration invite token (public).
   */
  async validateToken(
    token: string,
  ): Promise<{ valid: boolean; email: string; role: string }> {
    return await api<{ valid: boolean; email: string; role: string }>(
      `${STAFF_PATH}/validate-token`,
      { query: { token } },
    );
  },

  /**
   * Activates the current user as platform staff using an invite token.
   */
  async accept(token: string): Promise<{ success: boolean; role: string }> {
    return await api<{ success: boolean; role: string }>(`${STAFF_PATH}/accept`, {
      method: "POST",
      body: { token },
    });
  },
};
