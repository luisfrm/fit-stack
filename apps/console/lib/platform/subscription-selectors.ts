/**
 * Pure selectors for SaaS subscriptions module (no fetch, no "now" hardcoded dates).
 */
import { differenceInCalendarDays } from "date-fns";
import type {
  PlatformPayment,
  SubscriptionWithDetails,
  SubscriptionStats,
} from "@/lib/services/platform-subscriptions-service";

export interface TopPlanRevenue {
  planId: number;
  planName: string;
  revenueCents: number;
  count: number;
}

/** Effective price of the subscription in cents (override or plan price; trial/absent = 0). */
export function effectivePriceCents(sub: SubscriptionWithDetails): number {
  if (sub.isTrial) return 0;
  return sub.priceOverride ?? sub.planPrice ?? 0;
}

/** Top plans by cumulative revenue, ordered descending. */
export function selectTopPlansByRevenue(
  subs: SubscriptionWithDetails[],
): TopPlanRevenue[] {
  const byPlan = new Map<number, TopPlanRevenue>();
  for (const sub of subs) {
    const current = byPlan.get(sub.planId) ?? {
      planId: sub.planId,
      planName: sub.planName ?? `Plan ${sub.planId}`,
      revenueCents: 0,
      count: 0,
    };
    current.revenueCents += effectivePriceCents(sub);
    current.count += 1;
    byPlan.set(sub.planId, current);
  }
  return [...byPlan.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export interface RevenueGrowth {
  current: number;
  previous: number;
  /** Month-over-month growth %, null if not computable (previous month was 0). */
  pct: number | null;
}

/** Current vs previous month revenue growth (null-safe against division by zero). */
export function selectRevenueGrowth(stats: SubscriptionStats): RevenueGrowth {
  const current = stats.monthlyRevenueCents;
  const previous = stats.previousMonthRevenueCents;
  if (previous <= 0) return { current, previous, pct: null };
  return { current, previous, pct: ((current - previous) / previous) * 100 };
}

export interface ExpiringSoon {
  sub: SubscriptionWithDetails;
  daysLeft: number;
}

/**
 * Subscriptions expiring in `days` days (including today), sorted by
 * ascending expiration and capped at `limit`. Includes trials and periods
 * with pending payments: everything needing commercial attention.
 */
export function selectExpiringSoon(
  subs: SubscriptionWithDetails[],
  now: Date,
  days = 7,
  limit = 5,
): ExpiringSoon[] {
  const upcoming: ExpiringSoon[] = [];
  for (const sub of subs) {
    if (sub.cancelledAt) continue;
    const end = new Date(sub.currentPeriodEnd);
    if (Number.isNaN(end.getTime())) continue;
    const daysLeft = differenceInCalendarDays(end, now);
    if (daysLeft < 0 || daysLeft > days) continue;
    upcoming.push({ sub, daysLeft });
  }
  upcoming.sort(
    (a, b) =>
      new Date(a.sub.currentPeriodEnd).getTime() -
      new Date(b.sub.currentPeriodEnd).getTime(),
  );
  return upcoming.slice(0, limit);
}

/**
 * SaaS billing for an organization in current UTC month (only `validated`
 * payments, `baseAmount ?? amountPaid` — same formula as revenue).
 */
export function selectOrgCurrentMonth(
  invoices: Pick<
    PlatformPayment,
    "status" | "paymentDate" | "amountPaid" | "baseAmount"
  >[],
  now: Date,
): { totalCents: number; count: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  let totalCents = 0;
  let count = 0;
  for (const invoice of invoices) {
    if (invoice.status !== "validated") continue;
    const d = new Date(invoice.paymentDate);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) continue;
    totalCents += invoice.baseAmount ?? invoice.amountPaid;
    count += 1;
  }
  return { totalCents, count };
}

/** Total validated for an organization (same formula as monthly bucket). */
export function selectOrgBilledTotal(
  invoices: Pick<PlatformPayment, "status" | "amountPaid" | "baseAmount">[],
): { totalCents: number; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const invoice of invoices) {
    if (invoice.status !== "validated") continue;
    totalCents += invoice.baseAmount ?? invoice.amountPaid;
    count += 1;
  }
  return { totalCents, count };
}
