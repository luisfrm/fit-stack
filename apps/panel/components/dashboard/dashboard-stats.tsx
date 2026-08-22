"use client";

import * as React from "react";
import { KpiGroup } from "./kpi-group";
import { CompactMoney } from "./compact-money";
import { Text } from "@workspace/ui/components";
import type { DashboardStats } from "@/lib/services/dashboard-service";

interface TodayIncome {
  /** Monto normalizado a la divisa primaria, en unidades mayores */
  readonly amount: number | null;
  readonly currency: string;
}

interface DashboardStatsViewProps {
  readonly stats: DashboardStats;
  readonly todayIncome?: TodayIncome | null;
  readonly pendingPayments?: number | null;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  const diffInMs = now.getTime() - past.getTime();
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 24));

  if (diffInMins < 2) return "Ahora mismo";
  if (diffInMins < 60) return `Hace ${diffInMins} min`;
  if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? "hora" : "horas"}`;
  if (diffInDays === 1) return "Ayer";
  return past.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function DashboardStatsView({ stats, todayIncome, pendingPayments }: DashboardStatsViewProps) {
  const items = React.useMemo(
    () => [
      {
        label: "Miembros Activos",
        value: String(stats.activeMembers),
        icon: "users" as const,
        trend: { value: "Total actual", direction: "neutral" as const },
      },
      {
        label: "Clases Hoy",
        value: String(stats.classesToday),
        icon: "calendar" as const,
        trend: { value: "Programadas", direction: "neutral" as const },
      },
      {
        label: "Ingresos del Día",
        value: (
          <CompactMoney
            amount={todayIncome?.amount ?? null}
            currency={todayIncome?.currency}
          />
        ),
        icon: "wallet" as const,
        trend: { value: "Hoy", direction: "up" as const },
      },
      {
        label: "Pagos Pendientes",
        value:
          pendingPayments === null || pendingPayments === undefined ? (
            <Text as="span" className="text-3xl">—</Text>
          ) : (
            String(pendingPayments)
          ),
        icon: "clock" as const,
        trend: { value: "Por validar", direction: "neutral" as const },
      },
      {
        label: "Membresías por Vencer",
        value: String(stats.membershipsExpiring),
        icon: "alert" as const,
        trend: { value: "Próx. 7 días", direction: "neutral" as const },
        accent: true,
      },
    ],
    [stats, todayIncome, pendingPayments],
  );

  return <KpiGroup items={items} />;
}

export { getRelativeTime };