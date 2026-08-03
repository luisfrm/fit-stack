import { ORG_ROLES, type OrgRole } from "../constants";
import { type PlatformRole } from "../access-control";

/**
 * Whether `actor` may assign `target` as auth member role (anti-escalation).
 * Used when creating/updating staff or members with a role field.
 */
export function canAssignRole(actor: OrgRole, target: OrgRole): boolean {
  switch (actor) {
    case ORG_ROLES.OWNER:
      return true;
    case ORG_ROLES.MANAGER:
      return target !== ORG_ROLES.OWNER;
    case ORG_ROLES.CASHIER:
      return target === ORG_ROLES.MEMBER;
    default:
      return false;
  }
}

/**
 * Whether `actor` (a platform/global role) may assign `target` as a platform role
 * (anti-escalation for the SaaS admin staff module).
 *
 * - `owner`  → can assign any platform role (support, admin, owner)
 * - `admin`  → can assign `support` or `admin` (NEVER `owner`)
 * - `support`→ cannot assign anyone
 * - `user`   → cannot assign anyone
 */
export function canAssignPlatformRole(actor: PlatformRole, target: PlatformRole): boolean {
  switch (actor) {
    case "owner":
      return true;
    case "admin":
      return target === "admin" || target === "support";
    case "support":
      return false;
    default:
      return false;
  }
}
