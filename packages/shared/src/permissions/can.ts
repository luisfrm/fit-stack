import type { OrgRole } from "../constants";
import type { PermissionAction } from "./actions";
import type { PermissionModule } from "./modules";
import { ORG_ROLE_PERMISSIONS } from "./matrix";

/**
 * Pure permission check: role + module + action.
 * @example can(ORG_ROLES.CASHIER, PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)
 */
export function can(
  role: OrgRole,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  return ORG_ROLE_PERMISSIONS[role][module][action] === true;
}

export function canAny(
  role: OrgRole,
  checks: ReadonlyArray<readonly [PermissionModule, PermissionAction]>,
): boolean {
  return checks.some(([module, action]) => can(role, module, action));
}
