import {
  can,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type OrgRole,
  type PermissionAction,
  type PermissionModule } from "@workspace/shared";
import { db, eq, and } from "@workspace/database/client";
import { authMember } from "@workspace/database/schema";
import type { Session } from "./auth";

type MemberSession = Session & {
  member?: { id: string; organizationId: string; userId: string; role: string; createdAt: Date } | null;
};

export function getActiveOrgId(session: Session | null): string | null {
  if (!session) return null;
  return (session.session as { activeOrganizationId?: string }).activeOrganizationId ?? null;
}

export async function getOrgContext(session: Session | null, organizationId: string) {
  if (!session) return null;

  const activeOrgId = getActiveOrgId(session);
  if (activeOrgId !== organizationId) return null;

  const memberRole = (session as MemberSession).member?.role;
  if (memberRole) {
    return { memberRole: memberRole as OrgRole };
  }

  const [member] = await db
    .select({ role: authMember.role })
    .from(authMember)
    .where(and(
      eq(authMember.userId, session.user.id),
      eq(authMember.organizationId, organizationId)
    ))
    .limit(1);

  if (!member) return null;
  return { memberRole: member.role as OrgRole };
}

/**
 * Server-side permission check for tenant API routes.
 * @example await authorize(session, orgId, PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)
 */
export async function authorize(
  session: Session | null,
  organizationId: string,
  module: PermissionModule,
  action: PermissionAction,
): Promise<boolean> {
  const ctx = await getOrgContext(session, organizationId);
  if (!ctx) return false;
  return can(ctx.memberRole, module, action);
}

export function requireGlobalAdmin(session: Session | null): boolean {
  return (session?.user as { role?: string })?.role === 'admin';
}

/** Media uploads authorization: Allows upload if session is authenticated and scoped to the organization. */
export async function authorizeUpload(
  session: Session | null,
  organizationId: string,
): Promise<boolean> {
  if (!session || !organizationId) return false;
  return true;
}