import { rbacRepository } from "../repositories/rbac.repository";
import { db, eq } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";

export const rbacService = {
  /**
   * Fetches all unique permissions for a user (from roles and direct assignments)
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await rbacRepository.findUserRoles(userId);
    const directPermissions = await rbacRepository.findUserDirectPermissions(userId);

    const permissionsSet = new Set<string>();

    userRoles.forEach((ur: any) => {
      ur.role.rolePermissions.forEach((rp: any) => {
        permissionsSet.add(rp.permission.slug);
      });
    });

    directPermissions.forEach((dp: any) => {
      permissionsSet.add(dp.permission.slug);
    });

    return Array.from(permissionsSet);
  },

  async ensureRole(name: string, description: string) {
    let role = await rbacRepository.findRoleByName(name);
    role ??= await rbacRepository.createRole(name, description);
    return role;
  },

  async getAllRoles() {
    return rbacRepository.findAllRoles();
  },

  async getAllPermissions() {
    return rbacRepository.findAllPermissions();
  },

  async upsertRole(id: number | undefined, name: string, description: string, permissionIds: number[]) {
    let role: { id: number; name: string; description: string | null } | undefined;
    
    if (id) {
      // Update existing
      await db.update(schema.roles).set({ name, description }).where(eq(schema.roles.id, id));
      role = { id, name, description };
    } else {
      // Create new
      const newRole = await rbacRepository.createRole(name, description);
      role = newRole;
    }

    // Sync permissions
    if (role?.id) {
      await rbacRepository.deleteRolePermissions(role.id);
      await rbacRepository.addRolePermissions(role.id, permissionIds);
    }

    return role;
  },

  async updateUserRoles(userId: string, roleIds: number[]) {
    // 1. Delete current roles
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));

    // 2. Add new ones
    for (const roleId of roleIds) {
      await rbacRepository.assignRoleToUser(userId, roleId);
    }

    return { success: true };
  }
};
