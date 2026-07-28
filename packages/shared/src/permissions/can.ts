import type { OrgRole } from "../constants";
import type { PermissionAction } from "./actions";
import type { PermissionModule } from "./modules";
import { organizationRoles } from "../access-control";

/**
 * Pure permission check: role + module + action using Better Auth AC.
 */
export function can(
  role: OrgRole | string,
  module: PermissionModule | string,
  action: PermissionAction | string,
): boolean {
  if (!role) return false;
  const roleDef = (organizationRoles as Record<string, any>)[role];
  if (!roleDef) return false;
  return roleDef.authorize({ [module]: [action] }).success;
}

export function canAny(
  role: OrgRole | string,
  checks: ReadonlyArray<readonly [PermissionModule | string, PermissionAction | string]>,
): boolean {
  return checks.some(([module, action]) => can(role, module, action));
}

/**
  Alias for can() using clean, professional naming for permission checks.
 */
export const hasAccess = can;

