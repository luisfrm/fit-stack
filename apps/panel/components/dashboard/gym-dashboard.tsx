"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { TodayClassesTable } from "@/components/dashboard/today-classes-table";
import { RecentRegistrationsList } from "@/components/dashboard/recent-registrations";
import { DashboardStatsView } from "@/components/dashboard/dashboard-stats";
import { ExpiringMembersList } from "@/components/dashboard/expiring-members-list";
import { RecentlyExpiredList } from "@/components/dashboard/recently-expired-list";
import { DashboardChartsRow, type AnalyticsSlice } from "@/components/dashboard/dashboard-charts-row";
import { RevenueMiniChart } from "@/components/dashboard/revenue-mini-chart";
import { buildMonthlyCsv, type MonthlyRevenueRow } from "@/lib/dashboard/revenue-summary";
import { MemberModal } from "@/components/members/member-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { useRouter } from "next/navigation";
import type {
  IClassToday,
  IRecentRegistration,
} from "@workspace/shared/types";
import type { DashboardStats } from "@/lib/services/dashboard-service";
import type { MemberDeadlineItem } from "@/components/dashboard/member-deadline-row";

interface TodayIncome {
  readonly amount: number | null;
  readonly currency: string;
}

interface GymDashboardProps {
  readonly stats: DashboardStats;
  readonly todayClasses: IClassToday[];
  readonly recentRegistrations: IRecentRegistration[];
  /** Monto del día normalizado a la divisa primaria (unidades mayores) */
  readonly todayIncome?: TodayIncome | null;
  readonly pendingPayments?: number | null;
  /** Listas accionables: próximos a vencer / vencidos recientemente. */
  readonly actionItems: {
    expiring: MemberDeadlineItem[];
    recentlyExpired: MemberDeadlineItem[];
  } | null;
  /** Analítica de pagos (gráficas del dashboard, ya traída por el RSC). */
  readonly analytics: AnalyticsSlice | null;
  /** Reporte mensual de ingresos (mini-gráfica 6M + CSV, ya traído por el RSC). */
  readonly monthlyReport: MonthlyRevenueRow[];
  readonly primaryCurrency: string;
}

export function GymDashboard({
  stats,
  todayClasses,
  recentRegistrations,
  todayIncome,
  pendingPayments,
  actionItems,
  analytics,
  monthlyReport,
  primaryCurrency,
}: GymDashboardProps) {
  const router = useRouter();

  const onMemberCreated = () => {
    router.refresh();
  };

  const handleExportReport = () => {
    const csv = buildMonthlyCsv(monthlyReport, primaryCurrency);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reporte-mensual.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Reporte descargado.");
  };

  return (
    <>
      <DashboardHeader
        title="Panel de Control"
        description="Bienvenido de nuevo, aquí está el resumen de hoy."
        iconName="LayoutDashboard"
      >
        <Button
          variant="glass"
          size="sm"
          leftIcon={<Download size={18} />}
          onClick={handleExportReport}
          data-testid="dashboard-report-button"
        >
          Reporte
        </Button>
        <MemberModal
          onSuccess={onMemberCreated}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              Nuevo Miembro
            </Button>
          }
        />
      </DashboardHeader>

      <DashboardStatsView
        stats={stats}
        todayIncome={todayIncome}
        pendingPayments={pendingPayments}
      />

      <DashboardChartsRow analytics={analytics} />

      <div className="mb-10">
        <RevenueMiniChart monthlyReport={monthlyReport} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <Card className="lg:col-span-2 overflow-hidden pb-0 gap-0">
          <div className="p-6 flex justify-between items-center">
            <Text as="p" size="lg" weight="bold">Clases de Hoy</Text>
            <Link href="/classes" className="text-primary text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>
          <TodayClassesTable classes={todayClasses.slice(0, 6)} />
        </Card>

        <Card className="overflow-hidden flex flex-col">
          <div className="p-6">
            <Text as="p" size="lg" weight="bold">Últimos Pagos</Text>
          </div>
          <RecentRegistrationsList registrations={recentRegistrations} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <ExpiringMembersList items={actionItems?.expiring ?? []} />
        <RecentlyExpiredList items={actionItems?.recentlyExpired ?? []} />
      </div>
    </>
  );
}