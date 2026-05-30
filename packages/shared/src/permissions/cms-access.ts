import { ORG_ROLES, type OrgRole } from "../constants";

/** Org roles allowed to use the gym CMS (apps/cms). */
export const CMS_ALLOWED_ORG_ROLES = [
  ORG_ROLES.OWNER,
  ORG_ROLES.MANAGER,
  ORG_ROLES.CASHIER,
] as const;

export type CmsOrgRole = (typeof CMS_ALLOWED_ORG_ROLES)[number];

export function canAccessCms(role: OrgRole): role is CmsOrgRole {
  return (CMS_ALLOWED_ORG_ROLES as readonly OrgRole[]).includes(role);
}
