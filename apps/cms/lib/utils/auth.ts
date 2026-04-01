import { User } from "@/lib/auth-client";
import { ROLE_MAP } from "@/lib/config/constants";

/**
 * Checks if a user has a specific permission
 */
export function hasPermission(user: User | null, permission: string): boolean {
  return user?.permissions?.includes(permission) ?? false;
}

/**
 * Checks if the user has basic CMS access
 */
export function canAccessCMS(user: User | null): boolean {
  return hasPermission(user, "cms:access");
}

/**
 * Gets the human-readable name of a role from its ID
 */
export function getRoleName(roleId: number | undefined): string {
  if (roleId === undefined) return "Usuario";
  return ROLE_MAP[roleId] || "Usuario";
}
