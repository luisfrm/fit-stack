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

  const orgRole = session?.member?.role;
  const isOwner = orgRole === ORG_ROLES.OWNER;
  const isManager = orgRole === ORG_ROLES.MANAGER;
  const isCashier = orgRole === ORG_ROLES.CASHIER;
  const isCoach = orgRole === ORG_ROLES.COACH;
  const isMember = orgRole === ORG_ROLES.MEMBER;

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
    orgRole,
    isAdmin, // Global SaaS Admin
    isOwner, // Org Owner
    isManager, // Org Operational Admin
    isCashier,
    isCoach,
    isMember,

    // Actions
    refetch,
  };
}
