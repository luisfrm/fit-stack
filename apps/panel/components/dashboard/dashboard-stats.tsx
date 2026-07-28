"use client";

import * as React from "react";
import { KpiGroup } from "./kpi-group";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import type { DashboardStats } from "@/lib/services/dashboard-service";
import type { CurrencyFormat } from "@/lib/utils/value-converters";
import { ValueConverter } from "@/lib/utils/value-converters";

interface DashboardStatsViewProps {
  readonly stats: DashboardStats;
  readonly primaryCurrency?: string;
  readonly timezone?: string;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  const diffInMs = now.getTime() - past.getTime();
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMins < 2) return "Ahora mismo";
  if (diffInMins < 60) return `Hace ${diffInMins} min`;
  if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? "hora" : "horas"}`;
  if (diffInDays === 1) return "Ayer";
  return past.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function DashboardStatsView({ stats }: DashboardStatsViewProps) {
  const { settings } = useSettings();
  const primaryCurrency = settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date());
  void today;

  const formatIncome = (income: Record<string, number>): React.ReactNode => {
    if (!income || Object.keys(income).length === 0) {
      return ValueConverter.format(0, primaryCurrency, currencyFormat);
    }

    const keys = Object.keys(income);

    return (
      <div className="flex flex-col gap-1">
        {keys.map((cur) => {
          const amount = (income[cur] ?? 0) / 100;
          return (
            <div key={cur}>
              {ValueConverter.format(amount, cur, currencyFormat)}
            </div>
          );
        })}
      </div>
    );
  };

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
        label: "Ingresos del Mes",
        value: formatIncome(stats.monthlyIncome),
        icon: "wallet" as const,
        trend: { value: "Este mes", direction: "up" as const },
      },
      {
        label: "Membresías por Vencer",
        value: String(stats.membershipsExpiring),
        icon: "alert" as const,
        trend: { value: "Próx. 7 días", direction: "neutral" as const },
        accent: true,
      },
    ],
    [stats],
  );

  return <KpiGroup items={items} />;
}

export { getRelativeTime };
