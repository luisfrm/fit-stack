"use client";

import { useSession, useActiveOrganization } from "./client";
import { GLOBAL_ROLES, ORG_ROLES } from '@workspace/shared';
import type { User, Session } from "./client";
import type { IOrganization } from '@workspace/shared/types';

export function useAuth() {
  const { data: sessionData, isPending, error, refetch } = useSession();
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization();

  const session = sessionData as Session;
  const user = session?.user as User;

  const roleName = user?.role || GLOBAL_ROLES.USER;
  const isAdmin = user?.role === GLOBAL_ROLES.ADMIN;

  const orgRole = session?.member?.role;
  const isOwner = orgRole === ORG_ROLES.OWNER;
  const isManager = orgRole === ORG_ROLES.MANAGER;
  const isCashier = orgRole === ORG_ROLES.CASHIER;
  const isCoach = orgRole === ORG_ROLES.COACH;
  const isMember = orgRole === ORG_ROLES.MEMBER;

  return {
    session,
    user,
    activeOrganization: (activeOrganization as unknown as IOrganization) ?? null,

    isAuthenticated: !!session,
    isPending: isPending || orgPending,
    error,

    roleName,
    orgRole,
    isAdmin,
    isOwner,
    isManager,
    isCashier,
    isCoach,
    isMember,

    refetch,
  };
}

export { usePermissions } from "./permissions";