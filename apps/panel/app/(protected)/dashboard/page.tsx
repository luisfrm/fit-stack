import { sessionService } from "@workspace/auth/service";
import { dashboardService } from "@/lib/services/dashboard-service";
import { classesService } from "@/lib/services/classes-service";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { DashboardStatusToaster } from "@/components/dashboard/dashboard-status-toaster";
import { summarizeTodayIncome } from "@/lib/dashboard/revenue-summary";
import { toLocalDayString } from "@workspace/shared/date";
import type { IClassToday } from "@workspace/shared/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  // Uses the active org tz (required, just like api-worker) so that
  // "today" does not depend on server tz nor a hardcoded default.
  const orgTimezone = session?.activeOrganization?.timezone;

  const today = toLocalDayString(orgTimezone);

  // Primary currency: mandatory org column (no config fallback).
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
      financeService.getAnalytics().catch(() => null),
      // Single source of truth for the 6M mini-chart: monthly report (without ApiFetchOptions;
      // server cache lives in the endpoint 1h).
      financeService.getRevenueReport().catch(() => []),
      activeOrgId
        ? dashboardService.getActionItems(activeOrgId).catch(() => null)
        : Promise.resolve(null),
    ]);

  const todayIncome = analytics
    ? summarizeTodayIncome(analytics.kpis.todayRevenue, primaryCurrency)
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