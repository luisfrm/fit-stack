import { createAccessControl } from "better-auth/plugins/access";

// --- PLATFORM ACCESS CONTROL (SaaS Admin) ---
const platformStatement = {
  console: ["access", "manage"],
  user: ["create", "list", "ban", "impersonate", "delete", "set-role"],
  organization: ["list", "create", "approve", "suspend", "delete"],
  plan: ["create", "list", "update", "delete"],
  subscription: ["list", "cancel", "extend"],
  setting: ["read", "write"],
} as const;

export type PlatformStatement = typeof platformStatement;
export const platformAc = createAccessControl(platformStatement);

export const platformRoles = {
  support: platformAc.newRole({
    console: ["access"],
    user: ["list"],
    organization: ["list"],
    plan: ["list"],
    subscription: ["list"],
    setting: ["read"],
  }),
  admin: platformAc.newRole({
    console: ["access", "manage"],
    user: ["list", "ban", "set-role"],
    organization: ["list", "create", "approve", "suspend"],
    plan: ["create", "list", "update"],
    subscription: ["list", "cancel", "extend"],
    setting: ["read", "write"],
  }),
  owner: platformAc.newRole({
    console: ["access", "manage"],
    user: ["create", "list", "ban", "impersonate", "delete", "set-role"],
    organization: ["list", "create", "approve", "suspend", "delete"],
    plan: ["create", "list", "update", "delete"],
    subscription: ["list", "cancel", "extend"],
    setting: ["read", "write"],
  }),
};

export type PlatformRole = keyof typeof platformRoles | 'user';

/**
 * Pure platform permission check: role + module + action.
 *
 * Mirror of `can()` for organization roles. Console authorization must always
 * go through the matrix, never through hardcoded role comparisons.
 */
export function canPlatform(
  role: string | null | undefined,
  moduleName: keyof PlatformStatement,
  actionName: string,
): boolean {
  if (!role || !Object.hasOwn(platformRoles, role)) return false;
  const roleDef = platformRoles[role as keyof typeof platformRoles];
  const statement = {
    [moduleName]: [actionName],
  } as unknown as Parameters<typeof roleDef.authorize>[0];
  return roleDef.authorize(statement).success;
}

// --- ORGANIZATION ACCESS CONTROL (Tenant Gym) ---
const organizationStatement = {
  panel: ["access"],
  dashboard: ["read"],
  reports: ["read"],
  members: ["read", "create", "update", "delete"],
  staff: ["read", "create", "update", "delete"],
  // Better Auth's organization plugin authorizes `createInvitation` with this
  // resource (`{ invitation: ["create"] }`). Whoever can create a member or a
  // staff row can therefore invite an EXISTING user into the organization.
  invitation: ["create"],
  // A financial record (subscription + payment) is NEVER deleted: it is voided.
  // Therefore `subscriptions` does not expose `delete` to any role.
  subscriptions: ["read", "create", "update"],
  plans: ["read", "create", "update", "delete"],
  classes: ["read", "create", "update", "delete"],
  content: ["read", "create", "update", "delete"],
  settings: ["read", "update"],
  organization: ["read", "update"],
  ai: ["read"],
} as const;

export type OrganizationStatement = typeof organizationStatement;
export const organizationAc = createAccessControl(organizationStatement);

export const organizationRoles = {
  member: organizationAc.newRole({
    panel: [],
    dashboard: [],
    reports: [],
    members: [],
    staff: [],
    invitation: [],
    subscriptions: [],
    plans: ["read"],
    classes: ["read"],
    content: ["read"],
    settings: [],
    organization: [],
    ai: [],
  }),
  coach: organizationAc.newRole({
    panel: [],
    dashboard: [],
    reports: [],
    members: [],
    staff: [],
    invitation: [],
    subscriptions: [],
    plans: ["read"],
    classes: ["read", "update"],
    content: ["read"],
    settings: [],
    organization: [],
    ai: [],
  }),
  cashier: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: [],
    invitation: ["create"],
    subscriptions: ["read", "create", "update"],
    plans: ["read"],
    classes: ["read", "create", "update"],
    content: [],
    settings: ["read"],
    organization: [],
    ai: ["read"],
  }),
  manager: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: ["read", "create", "update"],
    invitation: ["create"],
    subscriptions: ["read", "create", "update"],
    plans: ["read", "create", "update"],
    classes: ["read", "create", "update"],
    content: ["read", "create", "update"],
    settings: ["read", "update"],
    organization: ["read", "update"],
    ai: ["read"],
  }),
  owner: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update", "delete"],
    staff: ["read", "create", "update", "delete"],
    invitation: ["create"],
    subscriptions: ["read", "create", "update"],
    plans: ["read", "create", "update", "delete"],
    classes: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "delete"],
    settings: ["read", "update"],
    organization: ["read", "update"],
    ai: ["read"],
  }),
};

export type OrganizationRole = keyof typeof organizationRoles;
export const orgRoleDefinitions = organizationRoles;

export { PERMISSION_MODULES } from "./permissions/modules";
export { PERMISSION_ACTIONS } from "./permissions/actions";


