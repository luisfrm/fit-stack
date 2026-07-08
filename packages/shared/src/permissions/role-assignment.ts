import { ORG_ROLES, type OrgRole } from "../constants";

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
