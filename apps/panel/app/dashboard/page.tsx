import { sessionService } from "@workspace/auth/service";
import { dashboardService } from "@/lib/services/dashboard-service";
import { classesService } from "@/lib/services/classes-service";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { settingsService } from "@/lib/services/settings-service";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { DashboardStatusToaster } from "@/components/dashboard/dashboard-status-toaster";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import type { IClassToday } from "@workspace/shared/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";
  const orgTimezone = session?.session?.activeOrganizationId
    ? DEFAULT_TIMEZONE
    : DEFAULT_TIMEZONE;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: orgTimezone,
  }).format(new Date());

  const [stats, todayClassesRaw, recentRegistrations, settings] =
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
      settingsService
        .getAll({ next: { revalidate: 600, tags: [`org:${activeOrgId}:settings`] } })
        .catch(() => ({})),
    ]);

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

  void settings;

  return (
    <>
      <DashboardStatusToaster />
      <GymDashboard
        stats={stats}
        todayClasses={todayClasses}
        recentRegistrations={recentRegistrations}
      />
    </>
  );
}
