"use client";

import { useAuth } from "./hooks";
import {
  can,
  canAccessCms,
  type OrgRole,
  type PermissionAction,
  type PermissionModule,
} from "@workspace/shared";

export function usePermissions() {
  const { orgRole } = useAuth();
  const role = orgRole as OrgRole | undefined;

  return {
    orgRole: role,
    can: (module: PermissionModule, action: PermissionAction) =>
      role ? can(role, module, action) : false,
    canAccessCms: () => (role ? canAccessCms(role) : false),
  };
}
