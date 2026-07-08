/**
 * Standard CRUD actions for org-level permission checks.
 */
export const PERMISSION_ACTIONS = {
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
} as const;

export type PermissionAction =
  (typeof PERMISSION_ACTIONS)[keyof typeof PERMISSION_ACTIONS];
