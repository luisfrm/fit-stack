import { ROLE_MAP } from "@/lib/config/constants";
import { GLOBAL_ROLES, ORG_ROLES } from "@workspace/shared";

/**
 * Gets the human-readable name of a role from its ID or String code.
 * Prioritizes 'admin' global role if detected.
 */
export function getRoleName(user: any): string {
  if (!user) return "user";

  if (user.role === GLOBAL_ROLES.ADMIN) {
    return ROLE_MAP[GLOBAL_ROLES.ADMIN] || 'admin';
  }

  const roleCode = user.role || user.roleId || ORG_ROLES.MEMBER;

  return ROLE_MAP[roleCode] || "Usuario";
}
