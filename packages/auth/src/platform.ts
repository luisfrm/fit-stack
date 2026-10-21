"use client";

import type { PlatformRole } from "@workspace/shared";
import { useSession } from "./client";
import type { Session, User } from "./client";

/**
 * Platform (FitStack SaaS) auth, used by the Console.
 *
 * Intentionally has no organization fields: the Console is platform-scoped.
 * Authorization uses the platform matrix through `canPlatform` /
 * `canAccessConsole` from `@workspace/shared`; this hook only exposes the
 * user and their platform role.
 */
export function usePlatformAuth() {
  const { data: sessionData, isPending, error, refetch } = useSession();

  const session = sessionData as Session;
  const user = session?.user as User;
  const platformRole = (user?.role ?? "user") as PlatformRole;

  return {
    session,
    user,
    platformRole,
    isPending,
    error,
    refetch,
  };
}
