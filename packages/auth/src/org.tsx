"use client";

import {
  can,
  ORG_ROLES,
  type IOrganization,
  type OrgRole,
} from "@workspace/shared";
import { useSession } from "./client";
import type { Session, User } from "./client";

/**
 * Organization ("gym") auth, shared by the Panel and any future tenant app.
 *
 * The role flags describe WHO the user is (labels, badges, copy). They must
 * NEVER gate access: authorization always goes through `useOrgPermissions`.
 * The single source of truth for what a role can do is the permission matrix
 * in `@workspace/shared` (`organizationRoles`).
 */
export function useOrgAuth() {
  const { data: sessionData, isPending, error, refetch } = useSession();

  const session = sessionData as Session;
  const user = session?.user as User;
  const orgRole = session?.member?.role as OrgRole | undefined;
  const activeOrganization =
    (session?.activeOrganization as unknown as IOrganization) ?? null;

  return {
    session,
    user,
    activeOrganization,
    orgRole,

    // Identity only — never use these to authorize.
    isOwner: orgRole === ORG_ROLES.OWNER,
    isManager: orgRole === ORG_ROLES.MANAGER,
    isCashier: orgRole === ORG_ROLES.CASHIER,
    isCoach: orgRole === ORG_ROLES.COACH,
    isMember: orgRole === ORG_ROLES.MEMBER,

    isPending,
    error,
    refetch,
  };
}

/**
 * Organization authorization. Thin wrapper over `can()` (the only permission
 * implementation), so client and server checks cannot drift.
 */
export function useOrgPermissions() {
  const { orgRole } = useOrgAuth();

  return {
    can: (module: string, action: string): boolean =>
      can(orgRole ?? "", module, action),
  };
}
