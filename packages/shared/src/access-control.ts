import { createAccessControl } from "better-auth/plugins/access";
import type { Role } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/organization/access";
import { ORG_ROLES } from "@workspace/shared/constants";

/**
 * Access Control for Better Auth organization plugin.
 *
 * Uses only the native Better Auth resources (organization, member, invitation).
 * Custom endpoint authorization is handled by role checks in auth-utils.ts.
 *
 * @see apps/api/config/auth-utils.ts for role-based helpers
 */
export const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

/**
 * Organization Role Definitions
 * Mapped directly from ORG_ROLES constants for a single source of truth.
 *
 * These permissions control what Better Auth's own endpoints allow
 * (e.g. authClient.organization.update(), inviting members, etc.).
 * They do NOT control custom API endpoints — use auth-utils.ts for that.
 */

export const owner = ac.newRole({
  ...adminAc.statements,          // Full control: org, member, invitation
});

export const manager = ac.newRole({
  ...adminAc.statements,          // Operational admin: org update, member management, invitations
  organization: ["update"],       // Can update org info but NOT delete
});

export const cashier = ac.newRole({
  member: ["create", "update"],   // Can register and update gym members
});

// newRole({}) infers K=never due to empty statements — cast needed to satisfy Role<any> contract
export const coach = ac.newRole({}) as unknown as Role<any>;

export const member = ac.newRole({}) as unknown as Role<any>;

/**
 * Unified role definitions for the organization plugin.
 * Keys match the string values from ORG_ROLES constants.
 */
export const orgRoleDefinitions: Record<string, Role<any>> = {
  [ORG_ROLES.OWNER]: owner,
  [ORG_ROLES.MANAGER]: manager,
  [ORG_ROLES.CASHIER]: cashier,
  [ORG_ROLES.COACH]: coach,
  [ORG_ROLES.MEMBER]: member,
};
