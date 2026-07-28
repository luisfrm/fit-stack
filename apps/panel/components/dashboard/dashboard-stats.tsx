"use client";

import * as React from "react";
import { KpiGroup } from "./kpi-group";
import { dashboardService } from "@/lib/services/dashboard-service";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { useAuth } from "@/lib/hooks/use-auth";
import { toast } from "@workspace/ui/components";

export function DashboardStats() {
  const [stats, setStats] = React.useState<{
    activeMembers: number;
    classesToday: number;
    monthlyIncome: Record<string, number>;
    membershipsExpiring: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const { settings } = useSettings();
  const { activeOrganization } = useAuth();
  const timezone = activeOrganization?.timezone || DEFAULT_TIMEZONE;
  const primaryCurrency = settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";

  React.useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
    }).format(new Date());

    dashboardService.getStats(today)
      .then(setStats)
      .catch((err) => {
        console.error("Failed to fetch dashboard stats", err);
        toast.error("Error al cargar estadísticas");
      })
      .finally(() => setLoading(false));
  }, []);

  const formatIncome = (income: Record<string, number>): React.ReactNode => {
    if (!income || Object.keys(income).length === 0) {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: primaryCurrency,
      }).format(0);
    }

    const keys = Object.keys(income);

    return (
      <div className="flex flex-col gap-1">
        {keys.map(cur => {
          const amount = (income[cur] ?? 0) / 100;
          const formatted = new Intl.NumberFormat("es-ES", {
            style: "currency",
            currency: cur,
            minimumFractionDigits: amount % 1 > 0 ? 2 : 0,
          }).format(amount);

          return <div key={cur}>{formatted}</div>;
        })}
      </div>
    );
  };

  const items = React.useMemo(() => [
    {
      label: "Miembros Activos",
      value: stats ? String(stats.activeMembers) : "0",
      icon: "users" as const,
      trend: { value: "Total actual", direction: "neutral" as const },
    },
    {
      label: "Clases Hoy",
      value: stats?.classesToday ? String(stats.classesToday) : "0",
      icon: "calendar" as const,
      trend: { value: "Programadas", direction: "neutral" as const },
    },
    {
      label: "Ingresos del Mes",
      value: stats ? formatIncome(stats.monthlyIncome) : "$0",
      icon: "wallet" as const,
      trend: { value: "Este mes", direction: "up" as const },
    },
    {
      label: "Membresías por Vencer",
      value: stats?.membershipsExpiring ? String(stats.membershipsExpiring) : "0",
      icon: "alert" as const,
      trend: { value: "Próx. 7 días", direction: "neutral" as const },
      accent: true,
    },
  ], [stats]);

  return <KpiGroup items={items} loading={loading} />;
}
