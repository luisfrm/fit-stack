import type { BetterAuthPlugin } from "better-auth";

export const rbacPlugin = () => ({
  id: "rbac",
  schema: {
    user: {
      fields: {
        roleId: {
          type: "number",
          required: false,
          references: { model: "roles", field: "id" }
        },
        memberId: {
          type: "number",
          required: false,
          references: { model: "members", field: "id" }
        }
      }
    },
    permissions: {
      fields: {
        name: { type: "string", required: true, unique: true },
        slug: { type: "string", required: true, unique: true },
        description: { type: "string", required: false },
      },
    },
    roles: {
      fields: {
        name: { type: "string", required: true, unique: true },
        description: { type: "string", required: false },
      },
    },
    rolePermissions: {
      fields: {
        roleId: {
          type: "number",
          required: true,
          references: { model: "roles", field: "id", onDelete: "cascade" }
        },
        permissionId: {
          type: "number",
          required: true,
          references: { model: "permissions", field: "id", onDelete: "cascade" }
        },
      },
    },
    userRoles: {
      fields: {
        userId: {
          type: "string",
          required: true,
          references: { model: "user", field: "id", onDelete: "cascade" }
        },
        roleId: {
          type: "number",
          required: true,
          references: { model: "roles", field: "id", onDelete: "cascade" }
        },
      },
    },
    userPermissions: {
      fields: {
        userId: {
          type: "string",
          required: true,
          references: { model: "user", field: "id", onDelete: "cascade" }
        },
        permissionId: {
          type: "number",
          required: true,
          references: { model: "permissions", field: "id", onDelete: "cascade" }
        },
      },
    },
  },
} satisfies BetterAuthPlugin);
