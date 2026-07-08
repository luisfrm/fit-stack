/**
 * Business domains for CMS / tenant API authorization.
 * Payment flows are covered by SUBSCRIPTIONS.
 */
export const PERMISSION_MODULES = {
  DASHBOARD: "dashboard",
  REPORTS: "reports",
  MEMBERS: "members",
  STAFF: "staff",
  SUBSCRIPTIONS: "subscriptions",
  PLANS: "plans",
  CLASSES: "classes",
  CONTENT: "content",
  SETTINGS: "settings",
  ORGANIZATION: "organization",
} as const;

export type PermissionModule =
  (typeof PERMISSION_MODULES)[keyof typeof PERMISSION_MODULES];

/** All module keys — used to build complete role matrices. */
export const PERMISSION_MODULE_VALUES = Object.values(
  PERMISSION_MODULES,
) as PermissionModule[];
