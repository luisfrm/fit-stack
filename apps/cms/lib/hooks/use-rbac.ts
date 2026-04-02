import { useQuery } from "@tanstack/react-query";
import { rbacService, type Role, type Permission } from "../services/rbac-service";

/**
 * Hook to fetch and cache RBAC roles.
 */
export function useRoles() {
  return useQuery<Role[]>({
    queryKey: ["rbac", "roles"],
    queryFn: rbacService.getRoles,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Hook to fetch and cache system permissions.
 */
export function usePermissions() {
  return useQuery<Permission[]>({
    queryKey: ["rbac", "permissions"],
    queryFn: rbacService.getPermissions,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
