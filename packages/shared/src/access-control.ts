import { createAccessControl } from "better-auth/plugins/access";

// --- PLATFORM ACCESS CONTROL (SaaS Admin) ---
const platformStatement = {
  user: ["create", "list", "ban", "impersonate", "delete", "set-role"],
  organization: ["create", "approve", "suspend", "delete"],
  plan: ["create", "list", "update", "delete"],
  subscription: ["list", "cancel", "extend"],
  setting: ["read", "write"],
} as const;

export type PlatformStatement = typeof platformStatement;
export const platformAc = createAccessControl(platformStatement);

export const platformRoles = {
  support: platformAc.newRole({
    user: ["list"],
    organization: [],
    plan: ["list"],
    subscription: ["list"],
    setting: ["read"],
  }),
  admin: platformAc.newRole({
    user: ["list", "ban", "set-role"],
    organization: ["create", "approve", "suspend"],
    plan: ["create", "list", "update"],
    subscription: ["list", "cancel", "extend"],
    setting: ["read", "write"],
  }),
  owner: platformAc.newRole({
    user: ["create", "list", "ban", "impersonate", "delete", "set-role"],
    organization: ["create", "approve", "suspend", "delete"],
    plan: ["create", "list", "update", "delete"],
    subscription: ["list", "cancel", "extend"],
    setting: ["read", "write"],
  }),
};

export type PlatformRole = keyof typeof platformRoles | 'user';

/**
 * Whether a user with the given global (platform) role can access the FitStack Console.
 * Derived from the permission matrix: the role must be able to create organizations
 * (`requirePlatformAuth` checks exactly this), so `admin` and `owner` pass but
 * `support` (read-only, no `organization.create`) does not.
 */
export function canAccessConsole(role?: string | null): boolean {
  if (!role || !(role in platformRoles)) return false;
  return platformRoles[role as keyof typeof platformRoles]
    .authorize({ organization: ['create'] })
    .success;
}

// --- ORGANIZATION ACCESS CONTROL (Tenant Gym) ---
const organizationStatement = {
  panel: ["access"],
  dashboard: ["read"],
  reports: ["read"],
  members: ["read", "create", "update", "delete"],
  staff: ["read", "create", "update", "delete"],
  subscriptions: ["read", "create", "update", "delete"],
  plans: ["read", "create", "update", "delete"],
  classes: ["read", "create", "update", "delete"],
  content: ["read", "create", "update", "delete"],
  settings: ["read", "update"],
  organization: ["read", "update"],
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
    subscriptions: [],
    plans: ["read"],
    classes: ["read"],
    content: ["read"],
    settings: [],
    organization: [],
  }),
  coach: organizationAc.newRole({
    panel: [],
    dashboard: [],
    reports: [],
    members: [],
    staff: [],
    subscriptions: [],
    plans: ["read"],
    classes: ["read", "update"],
    content: ["read"],
    settings: [],
    organization: [],
  }),
  cashier: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: [],
    subscriptions: ["read", "create", "update"],
    plans: ["read"],
    classes: ["read", "create", "update"],
    content: [],
    settings: ["read"],
    organization: [],
  }),
  manager: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: ["read", "create", "update"],
    subscriptions: ["read", "create", "update"],
    plans: ["read", "create", "update"],
    classes: ["read", "create", "update"],
    content: ["read", "create", "update"],
    settings: ["read", "update"],
    organization: ["read", "update"],
  }),
  owner: organizationAc.newRole({
    panel: ["access"],
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update", "delete"],
    staff: ["read", "create", "update", "delete"],
    subscriptions: ["read", "create", "update", "delete"],
    plans: ["read", "create", "update", "delete"],
    classes: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "delete"],
    settings: ["read", "update"],
    organization: ["read", "update"],
  }),
};

export type OrganizationRole = keyof typeof organizationRoles;
export const orgRoleDefinitions = organizationRoles;

export { PERMISSION_MODULES } from "./permissions/modules";
export { PERMISSION_ACTIONS } from "./permissions/actions";


