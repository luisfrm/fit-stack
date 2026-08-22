import { sessionService } from "@workspace/auth/service";
import { dashboardService } from "@/lib/services/dashboard-service";
import { classesService } from "@/lib/services/classes-service";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { settingsService } from "@/lib/services/settings-service";
import { financeService } from "@/lib/services/finance-service";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { DashboardStatusToaster } from "@/components/dashboard/dashboard-status-toaster";
import { getExchangeRates } from "@/lib/api/exchange-rates";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
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
  const activeOrgId = session?.session?.activeOrganizationId || "global";
  const orgTimezone = session?.session?.activeOrganizationId
    ? DEFAULT_TIMEZONE
    : DEFAULT_TIMEZONE;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: orgTimezone,
  }).format(new Date());

  const settingsTag = `org:${activeOrgId}:settings`;
  const settings = await settingsService
    .getAll({ next: { revalidate: 600, tags: [settingsTag] } })
    .catch(() => ({}) as Record<string, string>);
  const primaryCurrency = settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";

  const [stats, todayClassesRaw, recentRegistrations, analytics] =
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
        analytics={
          analytics
            ? {
                plansDistribution: analytics.plansDistribution,
                renewals: analytics.renewals,
                growth: analytics.growth,
              }
            : null
        }
      />
    </>
  );
}