import { ROLE_MAP } from "@/lib/config/constants";
import { ROLES } from "@workspace/shared/types";

/**
 * Gets the human-readable name of a role from its ID or String code.
 * Prioritizes 'admin' global role if detected.
 */
export function getRoleName(user: any): string {
  if (!user) return "user";

  if (user.role === ROLES.ADMIN) {
    return ROLE_MAP[ROLES.ADMIN] || 'user';
  }

  const roleCode = user.role || user.roleId || "member";

  return ROLE_MAP[roleCode] || "Usuario";
}
