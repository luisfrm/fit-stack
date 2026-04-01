import { db, eq, inArray } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";

export const rbacRepository = {
  // --- Permissions ---
  async findAllPermissions() {
    return db.query.permissions.findMany();
  },

  async findPermissionsBySlugs(slugs: string[]) {
    if (slugs.length === 0) return [];
    return db.query.permissions.findMany({
      where: inArray(schema.permissions.slug, slugs),
    });
  },

  async findPermissionsByRoleId(roleId: number) {
    return db.query.rolePermissions.findMany({
      where: eq(schema.rolePermissions.roleId, roleId),
      with: {
        permission: true
      }
    });
  },

  // --- Roles ---
  async findAllRoles() {
    return db.query.roles.findMany({
      with: {
        rolePermissions: {
          with: {
            permission: true
          }
        }
      }
    });
  },

  async findRoleByName(name: string) {
    return db.query.roles.findFirst({
      where: eq(schema.roles.name, name),
      with: {
        rolePermissions: {
          with: {
            permission: true
          }
        }
      }
    });
  },

  async createRole(name: string, description?: string) {
    const [newRole] = await db.insert(schema.roles).values({ name, description }).returning();
    return { 
      ...newRole, 
      rolePermissions: [] 
    } as NonNullable<Awaited<ReturnType<typeof rbacRepository.findRoleByName>>>;
  },

  async deleteRolePermissions(roleId: number) {
    await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
  },

  async addRolePermissions(roleId: number, permissionIds: number[]) {
    if (permissionIds.length === 0) return;
    const values = permissionIds.map(pId => ({ roleId, permissionId: pId }));
    await db.insert(schema.rolePermissions).values(values);
  },

  // --- User Associations ---
  async findUserRoles(userId: string) {
    return db.query.userRoles.findMany({
      where: eq(schema.userRoles.userId, userId),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: true
              }
            }
          }
        }
      }
    });
  },

  async findUserDirectPermissions(userId: string) {
    return db.query.userPermissions.findMany({
      where: eq(schema.userPermissions.userId, userId),
      with: {
        permission: true
      }
    });
  },

  async assignRoleToUser(userId: string, roleId: number) {
    await db.insert(schema.userRoles).values({ userId, roleId }).onConflictDoNothing();
  },

  async updateUserRoleId(userId: string, roleId: number | null) {
    await db.update(schema.user).set({ roleId }).where(eq(schema.user.id, userId));
  },

  async updateUserMemberId(userId: string, memberId: number | null) {
    await db.update(schema.user).set({ memberId }).where(eq(schema.user.id, userId));
  }
};
