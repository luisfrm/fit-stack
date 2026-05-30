import {
  can,
  GLOBAL_ROLES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type OrgRole,
  type PermissionAction,
  type PermissionModule,
} from "@workspace/shared";
import { auth } from "./auth";

type AnySession = (typeof auth.$Infer.Session & { member?: { role: string } }) | null;

export function getOrgContext(session: AnySession, organizationId: string) {
  if (!session) return null;

  const activeOrgId = session.session?.activeOrganizationId;
  if (activeOrgId !== organizationId) return null;

  const memberRole = session.member?.role;
  if (!memberRole) return null;

  return { memberRole: memberRole as OrgRole };
}

/**
 * Server-side permission check for tenant API routes.
 * @example authorize(session, orgId, PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)
 */
export function authorize(
  session: AnySession,
  organizationId: string,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;
  return can(ctx.memberRole, module, action);
}

export function requireGlobalAdmin(session: AnySession): boolean {
  return session?.user?.role === GLOBAL_ROLES.ADMIN;
}

/** Media uploads: CMS content (owner/manager) or member/staff avatars (cashier+). */
export function authorizeUpload(
  session: AnySession,
  organizationId: string,
): boolean {
  return (
    authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.CREATE) ||
    authorize(session, organizationId, PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.UPDATE)
  );
}
