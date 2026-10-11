import { addDuration, toLocalMonthString } from "@workspace/shared/date";
import type { IPlatformOrganization } from "@workspace/shared/types";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";

/**
 * Pure selectors for console dashboard widgets.
 *
 * Derived from existing available data (organizations with `latestSubscription`
 * and recent subscriptions) to avoid adding extra backend endpoints.
 * All dates use helpers from `@workspace/shared/date`; the month boundary
 * is UTC because SaaS billing operates in UTC.
 */

/** Max rows per widget (local pagination displays in groups of 10). */
export const DASHBOARD_WIDGET_LIMIT = 30;

/** Rows per page within each widget. */
export const DASHBOARD_WIDGET_PAGE_SIZE = 10;

/** "Expiring soon" window: 7 days (matching backend `status=expiring`). */
export const EXPIRING_WINDOW_DAYS = 7;

/** Reference timezone for platform-level thresholds. */
const PLATFORM_TIMEZONE = "UTC";

export interface RenewalItem {
  readonly org: IPlatformOrganization;
  readonly urgency: "overdue" | "expiring";
  readonly periodEnd: Date;
}

export interface TrialItem {
  readonly org: IPlatformOrganization;
  readonly periodEnd: Date;
}

export interface TrialsSelection {
  readonly expiring: TrialItem[];
  readonly all: TrialItem[];
}

function toDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Gyms created during the current calendar month (UTC), newest first.
 */
export function selectNewOrgsThisMonth(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): IPlatformOrganization[] {
  const currentMonth = toLocalMonthString(PLATFORM_TIMEZONE, now);
  return orgs
    .filter((org) => {
      const createdAt = toDate(org.createdAt);
      return (
        createdAt !== null &&
        toLocalMonthString(PLATFORM_TIMEZONE, createdAt) === currentMonth
      );
    })
    .sort(
      (a, b) =>
        (toDate(b.createdAt)?.getTime() ?? 0) -
        (toDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, DASHBOARD_WIDGET_LIMIT);
}

/**
 * Gyms pending renewal: overdue first (`past_due`/`read_only`/
 * `suspended`, most overdue at the top) followed by expiring (active with end
 * within 7 days, soonest at the top). Excludes trials, cancelled, and
 * organizations without active subscription (free tier / no plan).
 */
export function selectRenewals(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): RenewalItem[] {
  const windowEnd = addDuration(
    now,
    EXPIRING_WINDOW_DAYS,
    "day",
    PLATFORM_TIMEZONE,
  );
  const overdue: RenewalItem[] = [];
  const expiring: RenewalItem[] = [];

  for (const org of orgs) {
    const sub = org.latestSubscription;
    if (!sub || sub.isTrial || sub.cancelledAt) continue;
    const periodEnd = toDate(sub.currentPeriodEnd);
    if (!periodEnd) continue;

    if (
      sub.status === "past_due" ||
      sub.status === "read_only" ||
      sub.status === "suspended"
    ) {
      overdue.push({ org, urgency: "overdue", periodEnd });
    } else if (
      sub.status === "active" &&
      periodEnd.getTime() > now.getTime() &&
      periodEnd.getTime() <= windowEnd.getTime()
    ) {
      expiring.push({ org, urgency: "expiring", periodEnd });
    }
  }

  overdue.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  expiring.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  return [...overdue, ...expiring].slice(0, DASHBOARD_WIDGET_LIMIT);
}

/**
 * Trials: `expiring` (end within 7 days, non-cancelled) and `all`
 * (all non-cancelled trials). Both sorted by period end.
 */
export function selectTrials(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): TrialsSelection {
  const windowEnd = addDuration(
    now,
    EXPIRING_WINDOW_DAYS,
    "day",
    PLATFORM_TIMEZONE,
  );
  const expiring: TrialItem[] = [];
  const all: TrialItem[] = [];

  for (const org of orgs) {
    const sub = org.latestSubscription;
    if (!sub || !sub.isTrial || sub.cancelledAt) continue;
    const periodEnd = toDate(sub.currentPeriodEnd);
    if (!periodEnd) continue;

    all.push({ org, periodEnd });
    if (
      periodEnd.getTime() > now.getTime() &&
      periodEnd.getTime() <= windowEnd.getTime()
    ) {
      expiring.push({ org, periodEnd });
    }
  }

  all.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  expiring.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  return {
    expiring: expiring.slice(0, DASHBOARD_WIDGET_LIMIT),
    all: all.slice(0, DASHBOARD_WIDGET_LIMIT),
  };
}

/**
 * Subscriptions with latest payment under review (`processing`), newest first.
 * Approval/rejection happens in org details (payment history modal).
 */
export function selectPaymentsReview(
  subs: SubscriptionWithDetails[],
): SubscriptionWithDetails[] {
  return subs
    .filter((sub) => sub.latestPaymentStatus === "processing")
    .sort(
      (a, b) =>
        (toDate(b.createdAt)?.getTime() ?? 0) -
        (toDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, DASHBOARD_WIDGET_LIMIT);
}
