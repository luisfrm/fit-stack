"use server";

import { updateTag } from "next/cache";
import { sessionService } from "@/lib/services/session-service";

/**
 * Purges Next.js data cache for the active organization's settings.
 *
 * `updateTag` is **server-only** (`next/cache`): consumers of settings
 * are client components (`settings/*` pages and `useSettings` hook), so
 * invalidation travels through this server action. A client component CANNOT
 * invoke `updateTag` directly.
 *
 * The tag is ALWAYS derived from the server session — never from a value
 * supplied by the client (same invariant as RSC pages invalidating inline).
 *
 * Full pattern reminder: service → this cache purge → `router.refresh()`.
 * Without this purge, `refresh()` reads the still-fresh tagged cache entry
 * and the screen stays stale until cache TTL expires.
 */
export async function invalidateSettingsCache(): Promise<void> {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  if (!activeOrgId) return;
  updateTag(`org:${activeOrgId}:settings`);
}
