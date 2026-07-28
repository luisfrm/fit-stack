"use client";

import { useAuth } from "./hooks";
import {
  organizationRoles,
  type OrganizationRole,
} from "@workspace/shared";

export function usePermissions() {
  const { orgRole } = useAuth();
  const role = orgRole as OrganizationRole | undefined;

  return {
    orgRole: role,
    can: (moduleName: string, actionName: string) => {
      if (!role) return false;
      const roleDef = organizationRoles[role];
      if (!roleDef) return false;
      return (roleDef as any).authorize({ [moduleName]: [actionName] }).success;
    },
    canAccessCms: () => {
      if (!role) return false;
      return role === 'owner' || role === 'manager' || role === 'cashier';
    },
  };
}
