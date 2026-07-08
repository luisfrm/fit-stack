import { PERMISSION_ACTIONS, type PermissionAction } from "./actions";
import { PERMISSION_MODULE_VALUES, type PermissionModule } from "./modules";

export type ModulePermissions = Partial<Record<PermissionAction, boolean>>;

export type OrgPermissions = Record<PermissionModule, ModulePermissions>;

const A = PERMISSION_ACTIONS;

/** Reusable action sets — no string literals in role matrices. */
export const PERMISSION_PRESETS = {
  NONE: {} as ModulePermissions,
  READ: { [A.READ]: true } as ModulePermissions,
  READ_UPDATE: { [A.READ]: true, [A.UPDATE]: true } as ModulePermissions,
  READ_CREATE_UPDATE: {
    [A.READ]: true,
    [A.CREATE]: true,
    [A.UPDATE]: true,
  } as ModulePermissions,
  CRUD: {
    [A.READ]: true,
    [A.CREATE]: true,
    [A.UPDATE]: true,
    [A.DELETE]: true,
  } as ModulePermissions,
} as const;

/** Empty matrix (coach / member — no CMS access). */
export function buildEmptyOrgPermissions(): OrgPermissions {
  return Object.fromEntries(
    PERMISSION_MODULE_VALUES.map((module) => [module, PERMISSION_PRESETS.NONE]),
  ) as OrgPermissions;
}
