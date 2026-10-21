"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { settingsService } from "@/lib/services/settings-service";
import { invalidateSettingsCache } from "@/lib/actions/settings";
import { mutationError } from "@workspace/shared";
import { toast } from "@workspace/ui";

export const SETTINGS_KEYS = {
  BRAND_PRIMARY: "brand_primary",
  ACTIVE_CURRENCIES: "active_currencies",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
} as const;

const EMPTY_SETTINGS: Record<string, string> = {};
const SETTINGS_CACHE_KEY = "fitstack:settings";
const SETTINGS_TTL_MS = 1000 * 60 * 2;

let memoryCache: Record<string, string> | null = null;
let pendingSettingsPromise: Promise<Record<string, string>> | null = null;

function readCache(): { data: Record<string, string>; ts: number } | null {
  if (typeof window === "undefined") return null;
  if (memoryCache) return { data: memoryCache, ts: Date.now() };
  try {
    const raw = sessionStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Record<string, string>; ts: number };
    if (Date.now() - parsed.ts > SETTINGS_TTL_MS) {
      memoryCache = null;
      return null;
    }
    memoryCache = parsed.data;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: Record<string, string>) {
  memoryCache = data;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // ignore quota errors
  }
}

/**
 * Shared fetcher that deduplicates concurrent in-flight network requests for organization settings.
 */
function fetchSettingsShared(): Promise<Record<string, string>> {
  const cached = readCache();
  if (cached) return Promise.resolve(cached.data);
  if (pendingSettingsPromise) return pendingSettingsPromise;

  pendingSettingsPromise = settingsService
    .getAll()
    .then((data) => {
      writeCache(data);
      pendingSettingsPromise = null;
      return data;
    })
    .catch((err) => {
      pendingSettingsPromise = null;
      throw err;
    });

  return pendingSettingsPromise;
}

/**
 * Hook for reading and mutating organization settings from client components.
 * Uses a sessionStorage cache and in-flight promise deduplication to avoid refetching on every mount.
 *
 * For initial SSR data, prefer loading settings in the parent Server Component
 * and passing them down as props.
 */
export function useSettings() {
  const router = useRouter();
  const [settings, setSettings] = React.useState<Record<string, string>>(
    () => readCache()?.data ?? EMPTY_SETTINGS,
  );
  const [isLoading, setIsLoading] = React.useState(
    () => readCache() === null,
  );
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    const cached = readCache();
    if (cached) {
      setSettings(cached.data);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    fetchSettingsShared()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
      })
      .catch(() => {
        // Silent failure — settings are non-critical for many views.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = React.useCallback(
    async (next: Record<string, string>) => {
      try {
        setIsUpdating(true);
        const updated = await settingsService.update(next);
        // The API returns the full settings object, not just the patch.
        // Use it so the local state and cache always reflect reality.
        setSettings(updated);
        writeCache(updated);
        // Invalidates Next data cache (RSC with tags org:{orgId}:settings)
        // before refreshing: purge is server-only, so it travels via the
        // server action. Without it, refresh() re-reads the cached entry.
        await invalidateSettingsCache();
        toast.success("Ajustes actualizados correctamente");
        router.refresh();
      } catch (error) {
        // Raw API message is never shown to the user — console only.
        toast.error(mutationError("useSettings.update", error, "Error al actualizar los ajustes"));
        throw error;
      } finally {
        setIsUpdating(false);
      }
    },
    [router],
  );

  return { settings, isLoading, isUpdating, updateSettings };
}
