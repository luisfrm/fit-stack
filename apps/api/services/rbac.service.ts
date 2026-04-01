import { rbacRepository } from "../repositories/rbac.repository";
import { db, eq } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";

export const rbacService = {
  /**
   * Fetches all unique permissions for a user (from roles and direct assignments)
   */
  async getUserPermissions(userId: string, roleId?: number): Promise<string[]> {
    const permissionsSet = new Set<string>();

    let activeRoleId = roleId;

    // Si no viene roleId, intentamos sacarlo del usuario (columna directa)
    if (!activeRoleId) {
      const [u] = await db
        .select({ roleId: schema.user.roleId })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      activeRoleId = u?.roleId ?? undefined;
    }

    // 1. Permisos del rol principal (columna user.role_id)
    if (activeRoleId) {
      const rolePerms = await rbacRepository.findPermissionsByRoleId(activeRoleId);
      rolePerms.forEach((rp: any) => {
        permissionsSet.add(rp.permission.slug);
      });
    }

    // 2. Roles de la tabla puente (user_roles) - Legacy/Soporte multi-rol
    const userRoles = await rbacRepository.findUserRoles(userId);
    userRoles.forEach((ur: any) => {
      ur.role.rolePermissions.forEach((rp: any) => {
        permissionsSet.add(rp.permission.slug);
      });
    });

    // 3. Permisos directos
    const directPermissions = await rbacRepository.findUserDirectPermissions(userId);
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
    // 1. Delete current roles in junction table
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));

    // 2. Add new ones in junction table
    for (const roleId of roleIds) {
      await rbacRepository.assignRoleToUser(userId, roleId);
    }

    // 3. Sincronizar el rol principal en la tabla user (tomamos el primero)
    const primaryRoleId = roleIds.length > 0 ? (roleIds[0] as number) : null;
    await rbacRepository.updateUserRoleId(userId, primaryRoleId);

    return { success: true };
  }
};
