import { createAccessControl } from "better-auth/plugins/access";
import type { Role } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { ORG_ROLES } from "@workspace/shared/constants";

/**
 * Better Auth organization plugin — native endpoints only (invite, org update).
 * Custom API routes use authorize() + ORG_ROLE_PERMISSIONS in auth-utils.ts.
 */
export const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const manager = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const cashier = ac.newRole({
  member: ["create", "update"],
});

export const coach = ac.newRole({}) as unknown as Role<any>;

export const member = ac.newRole({}) as unknown as Role<any>;

export const orgRoleDefinitions: Record<string, Role<any>> = {
  [ORG_ROLES.OWNER]: owner,
  [ORG_ROLES.MANAGER]: manager,
  [ORG_ROLES.CASHIER]: cashier,
  [ORG_ROLES.COACH]: coach,
  [ORG_ROLES.MEMBER]: member,
};
