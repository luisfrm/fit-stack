"use client";

import { useSession } from "@/lib/auth-client";
import { ROLES } from "@workspace/shared/types";
import { getRoleName } from "@/lib/utils/auth";
import { useMemo } from "react";
import type { User } from "@/lib/auth-client";

/**
 * Fit-Stack Custom Auth Hook
 * Provides reactive access to session, user, and role-based permissions.
 */
export function useAuth() {
  const { data: session, isPending, error, refetch } = useSession();

  const user = (session?.user as unknown as User) || null;
  
  // Use useMemo to avoid recalculating on every render if user hasn't changed
  const roleName = useMemo(() => getRoleName(user), [user]);

  // Role flags for easy UI conditions
  const isAdmin = user?.role === ROLES.ADMIN;
  const isCoach = user?.role === "coach" || user?.role === "COACH"; // Based on typical naming
  const isMember = user?.role === "member" || user?.role === "MEMBER";

  return {
    // Core session data
    session,
    user,
    
    // Auth status
    isAuthenticated: !!session,
    isPending,
    error,
    
    // Role information
    roleName,
    isAdmin,
    isCoach,
    isMember,
    
    // Actions
    refetch
  };
}
