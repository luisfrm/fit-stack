/**
 * Selectores puros del módulo de suscripciones SaaS (sin fetch, sin fechas "ahora").
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

/** Precio efectivo de la sub en centavos (override o precio del plan; trial/ausente = 0). */
export function effectivePriceCents(sub: SubscriptionWithDetails): number {
  if (sub.isTrial) return 0;
  return sub.priceOverride ?? sub.planPrice ?? 0;
}

/** Top planes por revenue sumado, ordenados de mayor a menor. */
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
  /** % de crecimiento mes a mes, null si no es calculable (mes previo en 0). */
  pct: number | null;
}

/** Crecimiento de ingresos mes actual vs previo (null-safe ante división por cero). */
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
 * Suscripciones que vencen en `days` días (incluye hoy), ordenadas por
 * vencimiento ascendente y topadas a `limit`. Incluye trials y periodos
 * con pago pendiente: todo lo que necesita atención comercial.
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
 * Facturación SaaS de una org en el mes UTC en curso (solo pagos
 * `validated`, `baseAmount ?? amountPaid` — misma fórmula que el revenue).
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

/** Total validado de una org (misma fórmula que el bucket mensual). */
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
