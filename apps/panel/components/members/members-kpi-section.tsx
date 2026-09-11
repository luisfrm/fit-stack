"use client";

import * as React from "react";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  AlertTriangle,
  MonitorSmartphone,
} from "lucide-react";
import { KpiCard } from "@/components/payments/kpi-card";
import type { IMemberStats } from "@workspace/shared/types";

interface MembersKpiSectionProps {
  readonly stats: IMemberStats | null;
}

/**
 * KPIs de clientes (`GET /api/members/stats`).
 * Solo presentación: los datos llegan del RSC (`page.tsx`), sin fetch propio.
 */
export function MembersKpiSection({ stats }: Readonly<MembersKpiSectionProps>) {
  const cards = React.useMemo(
    () => [
      {
        testid: "members-kpi-total",
        title: "Total Clientes",
        value: String(stats?.total ?? 0),
        description: "Miembros registrados",
        icon: Users,
        className: "text-blue-500",
      },
      {
        testid: "members-kpi-active",
        title: "Activos",
        value: String(stats?.active ?? 0),
        description: "Perfil activo",
        icon: UserCheck,
        className: "text-emerald-500",
      },
      {
        testid: "members-kpi-inactive",
        title: "Inactivos",
        value: String(stats?.inactive ?? 0),
        description: "Perfil inactivo",
        icon: UserX,
        className: "text-slate-500",
      },
      {
        testid: "members-kpi-new",
        title: "Nuevos este mes",
        value: String(stats?.newThisMonth ?? 0),
        description: "Altas del mes en curso",
        icon: UserPlus,
        className: "text-primary",
      },
      {
        testid: "members-kpi-without-subscription",
        title: "Sin suscripción",
        value: String(stats?.withoutActiveSubscription ?? 0),
        description: "Sin plan vigente",
        icon: AlertTriangle,
        className: "text-orange-500",
      },
      {
        testid: "members-kpi-portal",
        title: "Con portal",
        value: String(stats?.withPortal ?? 0),
        description: "Con cuenta vinculada",
        icon: MonitorSmartphone,
        className: "text-violet-500",
      },
    ],
    [stats],
  );

  if (!stats) return null;

  return (
    <div data-testid="members-kpi-section" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.testid} data-testid={card.testid}>
          <KpiCard
            title={card.title}
            value={card.value}
            description={card.description}
            icon={card.icon}
            iconClassName={card.className}
          />
        </div>
      ))}
    </div>
  );
}
