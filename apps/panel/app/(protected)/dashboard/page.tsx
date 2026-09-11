import { sessionService } from "@workspace/auth/service";
import { dashboardService } from "@/lib/services/dashboard-service";
import { classesService } from "@/lib/services/classes-service";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { DashboardStatusToaster } from "@/components/dashboard/dashboard-status-toaster";
import { getExchangeRates } from "@/lib/api/exchange-rates";
import { toLocalDayString } from "@workspace/shared/date";
import type { IClassToday } from "@workspace/shared/types";

export const dynamic = "force-dynamic";

/**
 * Normaliza el ingreso del día (multi-divisa, centavos) a la divisa primaria.
 * Server-side: los rates quedan cacheados por Next (`revalidate: 3600`).
 */
async function normalizeTodayRevenue(
  todayRevenue: Array<{ currency: string; amount: number }> | undefined,
  primaryCurrency: string,
): Promise<{ amount: number; currency: string } | null> {
  if (!todayRevenue || todayRevenue.length === 0) {
    return { amount: 0, currency: primaryCurrency };
  }

  const currencies = Array.from(new Set(todayRevenue.map((d) => d.currency)));
  const rates: Record<string, number> = {};
  await Promise.all(
    currencies.map(async (curr) => {
      if (curr === primaryCurrency) {
        rates[curr] = 1;
        return;
      }
      try {
        rates[curr] = (await getExchangeRates(curr))[primaryCurrency] ?? 1;
      } catch {
        rates[curr] = 1;
      }
    }),
  );

  const normalizedCents = todayRevenue.reduce(
    (acc, d) => acc + d.amount * (rates[d.currency] ?? 1),
    0,
  );

  return { amount: normalizedCents / 100, currency: primaryCurrency };
}

export default async function DashboardPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  // Usa la tz de la org activa (obligatoria, igual que el api-worker) para que
  // "hoy" no dependa de la tz del servidor ni de un default hardcodeado.
  const orgTimezone = session?.activeOrganization?.timezone;

  const today = toLocalDayString(orgTimezone);

  // Moneda principal: columna obligatoria de la org (sin fallback de config).
  const primaryCurrency = session?.activeOrganization?.primaryCurrency ?? "";

  const [stats, todayClassesRaw, recentRegistrations, analytics, monthlyReport, actionItems] =
    await Promise.all([
      dashboardService.getStats(today, {
        next: { revalidate: 60, tags: [`org:${activeOrgId}:dashboard:stats`] },
      }),
      classesService
        .getClassesByDate(today, {
          next: { revalidate: 60, tags: [`org:${activeOrgId}:classes`] },
        })
        .catch(() => []),
      subscriptionsService
        .getRecent(5, { next: { revalidate: 60, tags: [`org:${activeOrgId}:subscriptions`] } })
        .catch(() => []),
      financeService.getAnalytics(primaryCurrency).catch(() => null),
      // Fuente única de la mini-gráfica 6M: reporte mensual (sin ApiFetchOptions;
      // el cache server vive en el endpoint 1h + rates Next 1h).
      financeService.getRevenueReport(primaryCurrency).catch(() => []),
      activeOrgId
        ? dashboardService.getActionItems(activeOrgId).catch(() => null)
        : Promise.resolve(null),
    ]);

  const todayIncome = analytics
    ? await normalizeTodayRevenue(analytics.kpis.todayRevenue, primaryCurrency)
    : null;

  const todayClasses: IClassToday[] = todayClassesRaw
    .map((cls) => ({
      id: cls.id,
      name: cls.name,
      startTime: cls.startTime,
      endTime: cls.endTime,
      trainerName: cls.trainerName,
      capacity: cls.capacity,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <>
      <DashboardStatusToaster />
      <GymDashboard
        stats={stats}
        todayClasses={todayClasses}
        recentRegistrations={recentRegistrations}
        todayIncome={todayIncome}
        pendingPayments={analytics?.kpis.pendingPayments ?? null}
        actionItems={actionItems}
        analytics={analytics}
        monthlyReport={monthlyReport}
        primaryCurrency={primaryCurrency}
      />
    </>
  );
}