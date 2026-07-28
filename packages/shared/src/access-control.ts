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

// --- ORGANIZATION ACCESS CONTROL (Tenant Gym) ---
const organizationStatement = {
  dashboard: ["read"],
  reports: ["read"],
  members: ["read", "create", "update", "delete"],
  staff: ["read", "create", "update", "delete"],
  subscriptions: ["read", "create", "update", "delete"],
  plans: ["read", "create", "update", "delete"],
  classes: ["read", "create", "update", "delete"],
  content: ["read", "create", "update", "delete"],
  settings: ["read", "update"],
} as const;

export type OrganizationStatement = typeof organizationStatement;
export const organizationAc = createAccessControl(organizationStatement);

export const organizationRoles = {
  member: organizationAc.newRole({
    dashboard: [],
    reports: [],
    members: [],
    staff: [],
    subscriptions: [],
    plans: ["read"],
    classes: ["read"],
    content: ["read"],
    settings: [],
  }),
  coach: organizationAc.newRole({
    dashboard: [],
    reports: [],
    members: [],
    staff: [],
    subscriptions: [],
    plans: ["read"],
    classes: ["read", "update"],
    content: ["read"],
    settings: [],
  }),
  cashier: organizationAc.newRole({
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: [],
    subscriptions: ["read", "create", "update"],
    plans: ["read"],
    classes: ["read"],
    content: [],
    settings: ["read"],
  }),
  manager: organizationAc.newRole({
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update"],
    staff: ["read", "create", "update"],
    subscriptions: ["read", "create", "update"],
    plans: ["read", "create", "update"],
    classes: ["read", "create", "update"],
    content: ["read", "create", "update"],
    settings: ["read", "update"],
  }),
  owner: organizationAc.newRole({
    dashboard: ["read"],
    reports: ["read"],
    members: ["read", "create", "update", "delete"],
    staff: ["read", "create", "update", "delete"],
    subscriptions: ["read", "create", "update", "delete"],
    plans: ["read", "create", "update", "delete"],
    classes: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "delete"],
    settings: ["read", "update"],
  }),
};

export type OrganizationRole = keyof typeof organizationRoles;
export const orgRoleDefinitions = organizationRoles;

export const PERMISSION_MODULES = {
  DASHBOARD: 'dashboard',
  REPORTS: 'reports',
  MEMBERS: 'members',
  STAFF: 'staff',
  SUBSCRIPTIONS: 'subscriptions',
  PLANS: 'plans',
  CLASSES: 'classes',
  CONTENT: 'content',
  SETTINGS: 'settings',
} as const;

export const PERMISSION_ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

