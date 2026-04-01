import { apiClient } from "../api-client";

export interface Permission {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  rolePermissions: {
    permissionId: number;
    permission: Permission;
  }[];
}

export const rbacService = {
  async getRoles(): Promise<Role[]> {
    const response = await apiClient.get('/rbac/roles');
    return response.data;
  },

  async getPermissions(): Promise<Permission[]> {
    const response = await apiClient.get('/rbac/permissions');
    return response.data;
  },

  async upsertRole(data: { id?: number; name: string; description?: string; permissionIds: number[] }) {
    const response = await apiClient.post('/rbac/roles', data);
    return response.data;
  },

  async seed() {
    const response = await apiClient.post('/rbac/seed');
    return response.data;
  }
};
