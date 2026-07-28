"use client";

import { useAuth } from "./hooks";
import {
  organizationRoles,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  type OrganizationRole,
} from "@workspace/shared";

export function usePermissions() {
  const { orgRole } = useAuth();
  const role = orgRole as OrganizationRole | undefined;

  const checkAccess = (moduleName: string, actionName: string): boolean => {
    if (!role) return false;
    const roleDef = organizationRoles[role];
    if (!roleDef) return false;
    return (roleDef as any).authorize({ [moduleName]: [actionName] }).success;
  };

  return {
    orgRole: role,
    can: checkAccess,
    hasAccess: checkAccess,
    canAccessCms: () => checkAccess(PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS),
    canAccessPanel: () => checkAccess(PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS),
  };
}
