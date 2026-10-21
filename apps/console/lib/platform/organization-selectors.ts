/**
 * Pure selectors for the organizations module (no fetch).
 */
import type { IPlatformOrganization } from "@workspace/shared/types";
import { hasActiveSubscription } from "@/lib/platform/subscription-status";

export interface OrgKpis {
  total: number;
  newThisMonth: number;
  withActiveSub: number;
  withoutActiveSub: number;
}

/** Start of current UTC month for `now` in ms (mirror of selectNewOrgsThisMonth from dashboard). */
function monthStartUtcMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** KPIs derived from in-memory dataset (exact as long as dataset is complete). */
export function selectOrgKpis(
  orgs: IPlatformOrganization[],
  now: Date,
): OrgKpis {
  const monthStart = monthStartUtcMs(now);
  let newThisMonth = 0;
  let withActiveSub = 0;
  for (const org of orgs) {
    const createdAt = org.createdAt ? new Date(org.createdAt).getTime() : Number.NaN;
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
 * Health indicator for the org:
 * - `down`: no subscription or `suspended`/`cancelled`.
 * - `warn`: `past_due`/`read_only` or expires in ≤7 days.
 * - `ok`: `active`/`trial` for other cases.
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

/** Filters orgs by subscription status (`none` = no active subscription). */
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

/** Filters orgs by country. */
export function filterOrgsByCountry(
  orgs: IPlatformOrganization[],
  countryCode: string | null | undefined,
): IPlatformOrganization[] {
  if (!countryCode) return orgs;
  return orgs.filter((org) => org.countryCode === countryCode);
}

export interface PortalAdoption {
  /** % of members with active subscription NOT on Member Platform (upsell). null if no base. */
  outsidePct: number | null;
  inPortal: number;
  pending: number;
}

/** Member Platform adoption from org gym-overview. */
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
