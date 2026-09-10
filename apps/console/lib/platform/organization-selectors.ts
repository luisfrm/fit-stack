/**
 * Selectores puros del módulo de organizaciones (sin fetch).
 */
import type { IPlatformOrganization } from "@workspace/shared/types";
import { hasActiveSubscription } from "@/lib/platform-permissions";

export interface OrgKpis {
  total: number;
  newThisMonth: number;
  withActiveSub: number;
  withoutActiveSub: number;
}

/** Inicio del mes UTC de `now` en ms (mirror de selectNewOrgsThisMonth del dashboard). */
function monthStartUtcMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** KPIs derivados del dataset en memoria (exactos mientras el dataset sea completo). */
export function selectOrgKpis(
  orgs: IPlatformOrganization[],
  now: Date,
): OrgKpis {
  const monthStart = monthStartUtcMs(now);
  let newThisMonth = 0;
  let withActiveSub = 0;
  for (const org of orgs) {
    const createdAt = org.createdAt ? new Date(org.createdAt).getTime() : NaN;
    if (!Number.isNaN(createdAt) && createdAt >= monthStart) newThisMonth += 1;
    if (
      org.latestSubscription &&
      hasActiveSubscription(org.latestSubscription)
    ) {
      withActiveSub += 1;
    }
  }
  return {
    total: orgs.length,
    newThisMonth,
    withActiveSub,
    withoutActiveSub: orgs.length - withActiveSub,
  };
}

export type OrgHealth = "ok" | "warn" | "down";

const WARN_STATUSES = new Set(["past_due", "read_only"]);
const DOWN_STATUSES = new Set(["suspended", "cancelled"]);

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Semáforo de salud de la org:
 * - `down`: sin suscripción o `suspended`/`cancelled`.
 * - `warn`: `past_due`/`read_only` o vence en ≤7 días.
 * - `ok`: `active`/`trial` en el resto de casos.
 */
export function selectOrgHealth(
  org: IPlatformOrganization,
  now: Date,
): OrgHealth {
  const sub = org.latestSubscription;
  if (!sub) return "down";
  if (DOWN_STATUSES.has(sub.status) || sub.cancelledAt) return "down";
  if (WARN_STATUSES.has(sub.status)) return "warn";
  if (hasActiveSubscription(sub)) {
    const end = new Date(sub.currentPeriodEnd).getTime();
    if (!Number.isNaN(end) && end - now.getTime() <= EXPIRING_WINDOW_MS)
      return "warn";
    return "ok";
  }
  return "down";
}

export type OrgSubStatusFilter =
  | "active"
  | "past_due"
  | "read_only"
  | "suspended"
  | "cancelled"
  | "none";

/** Filtra orgs por estado de suscripción (`none` = sin suscripción activa). */
export function filterOrgsBySubStatus(
  orgs: IPlatformOrganization[],
  subStatus: OrgSubStatusFilter | null | undefined,
): IPlatformOrganization[] {
  if (!subStatus) return orgs;
  if (subStatus === "none") {
    return orgs.filter(
      (org) =>
        !org.latestSubscription ||
        !hasActiveSubscription(org.latestSubscription),
    );
  }
  if (subStatus === "active") {
    return orgs.filter(
      (org) =>
        org.latestSubscription && hasActiveSubscription(org.latestSubscription),
    );
  }
  return orgs.filter((org) => org.latestSubscription?.status === subStatus);
}

/** Filtra orgs por país. */
export function filterOrgsByCountry(
  orgs: IPlatformOrganization[],
  countryCode: string | null | undefined,
): IPlatformOrganization[] {
  if (!countryCode) return orgs;
  return orgs.filter((org) => org.countryCode === countryCode);
}

export interface PortalAdoption {
  /** % de miembros con sub activa que NO están en el Member Platform (upsell). null sin base. */
  outsidePct: number | null;
  inPortal: number;
  pending: number;
}

/** Adopción del Member Platform desde el gym-overview de la org. */
export function selectPortalAdoption(overview: {
  activeSubMembers: number;
  portal: { used: number; pending: number };
}): PortalAdoption {
  const { activeSubMembers, portal } = overview;
  if (activeSubMembers <= 0) {
    return { outsidePct: null, inPortal: portal.used, pending: portal.pending };
  }
  const outside = Math.max(0, activeSubMembers - portal.used);
  return {
    outsidePct: Math.round((outside / activeSubMembers) * 100),
    inPortal: portal.used,
    pending: portal.pending,
  };
}
