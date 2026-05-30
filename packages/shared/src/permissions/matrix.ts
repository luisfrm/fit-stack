import { ORG_ROLES, type OrgRole } from "../constants";
import { PERMISSION_MODULES } from "./modules";
import {
  buildEmptyOrgPermissions,
  PERMISSION_PRESETS,
  type OrgPermissions,
} from "./matrix-helpers";

const M = PERMISSION_MODULES;
const P = PERMISSION_PRESETS;

const ownerPermissions: OrgPermissions = {
  [M.DASHBOARD]: P.READ,
  [M.REPORTS]: P.READ,
  [M.MEMBERS]: P.CRUD,
  [M.STAFF]: P.CRUD,
  [M.SUBSCRIPTIONS]: P.CRUD,
  [M.PLANS]: P.CRUD,
  [M.CLASSES]: P.CRUD,
  [M.CONTENT]: P.CRUD,
  [M.SETTINGS]: P.READ_UPDATE,
  [M.ORGANIZATION]: P.READ_UPDATE,
};

const managerPermissions: OrgPermissions = {
  ...ownerPermissions,
  [M.SUBSCRIPTIONS]: P.READ_CREATE_UPDATE,
};

const cashierPermissions: OrgPermissions = {
  [M.DASHBOARD]: P.READ,
  [M.REPORTS]: P.READ,
  [M.MEMBERS]: P.CRUD,
  [M.STAFF]: P.NONE,
  [M.SUBSCRIPTIONS]: P.READ_CREATE_UPDATE,
  [M.PLANS]: P.READ,
  [M.CLASSES]: P.READ_CREATE_UPDATE,
  [M.CONTENT]: P.NONE,
  [M.SETTINGS]: P.READ,
  [M.ORGANIZATION]: P.NONE,
};

/**
 * Single source of truth: org role → module → action booleans.
 * Coach and member use empty matrices (CMS blocked; PWA in a future phase).
 */
export const ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermissions> = {
  [ORG_ROLES.OWNER]: ownerPermissions,
  [ORG_ROLES.MANAGER]: managerPermissions,
  [ORG_ROLES.CASHIER]: cashierPermissions,
  [ORG_ROLES.COACH]: buildEmptyOrgPermissions(),
  [ORG_ROLES.MEMBER]: buildEmptyOrgPermissions(),
};
