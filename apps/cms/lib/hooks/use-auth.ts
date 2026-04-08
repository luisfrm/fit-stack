"use client";

import { useSession, useActiveOrganization } from "@/lib/auth-client";
import { GLOBAL_ROLES, ORG_ROLES } from "@workspace/shared";
import type { User, Session } from "@/lib/auth-client";

/**
 * Fit-Stack Custom Auth Hook
 * Wrapper around Better Auth's native hooks:
 *  - useSession()              → user + session data
 *  - useActiveOrganization()   → active org (separate hook by design)
 *
 * Adds role-based permission flags for easy UI conditions.
 */
export function useAuth() {
  const { data: sessionData, isPending, error, refetch } = useSession();
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization();

  const session = sessionData as Session;
  const user = session?.user as User;

  const roleName = user?.role || GLOBAL_ROLES.USER;
  const isAdmin = user?.role === GLOBAL_ROLES.ADMIN;
  const isCoach = session?.member?.role === ORG_ROLES.COACH;
  const isMember = session?.member?.role === ORG_ROLES.MEMBER;

  return {
    // Core session data
    session,
    user,
    activeOrganization: activeOrganization ?? null,

    // Auth status
    isAuthenticated: !!session,
    isPending: isPending || orgPending,
    error,

    // Role information
    roleName,
    isAdmin,
    isCoach,
    isMember,

    // Actions
    refetch,
  };
}
