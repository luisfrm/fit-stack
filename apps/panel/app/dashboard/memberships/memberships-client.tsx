"use client";

import * as React from "react";
import { Plus, LayoutTemplate, Users, CreditCard } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { type IMembershipPlan, type IMembershipsSummary } from "@workspace/shared/types";
import { PlanCard } from "@/components/memberships/plan-card";
import { PlanModal } from "@/components/memberships/plan-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatCard } from "@workspace/ui/components";
import { NoData } from "@/components/dashboard/dashboard-ui";

interface MembershipsClientProps {
  readonly initialPlans: IMembershipPlan[];
  readonly initialSummary: IMembershipsSummary;
  readonly activeCurrencies: string[];
  readonly currencyFormat: "latam" | "usa";
}

export function MembershipsClient({
  initialPlans,
  initialSummary,
  activeCurrencies,
  currencyFormat,
}: MembershipsClientProps) {
  const router = useRouter();

  const formatMonthlyRevenue = (revenue: Record<string, number>): React.ReactNode => {
    const revenueKeys = Object.keys(revenue);
    const allDisplayCurrencies = Array.from(
      new Set([...activeCurrencies, ...revenueKeys]),
    );

    if (allDisplayCurrencies.length === 0) return "$0";

    return (
      <div className="flex flex-col gap-0.5">
        {allDisplayCurrencies.map((cur) => {
          const rawAmount = revenue[cur] ?? 0;
          const amount = rawAmount / 100;
          const locale = currencyFormat === "usa" ? "en-US" : "es-ES";

          if (!activeCurrencies.includes(cur) && rawAmount === 0) return null;

          const formatted = new Intl.NumberFormat(locale, {
            style: "currency",
            currency: cur,
            minimumFractionDigits: amount % 1 > 0 ? 2 : 0,
          }).format(amount);

          return (
            <div key={cur} className="flex items-center gap-2">
              <Text size="lg" weight="bold" className="text-primary truncate">
                {formatted}
              </Text>
              {!activeCurrencies.includes(cur) && (
                <span className="text-[10px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-white/40 uppercase font-bold tracking-tighter">
                  Inactiva
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Planes de Membresía"
        description="Administra y configura los niveles de suscripción de tu gimnasio."
        iconName="LayoutTemplate"
      >
        <PlanModal
          onSuccess={() => router.refresh()}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO PLAN
            </Button>
          }
        />
      </DashboardHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Planes Activos"
          value={initialPlans.filter((p) => p.isVisibleOnSite).length.toString()}
          icon={<LayoutTemplate className="text-primary size-5" />}
        />
        <StatCard
          title="Suscripciones Totales"
          value={String(initialSummary.totalActiveSubscriptions)}
          icon={<Users className="text-blue-400 size-5" />}
        />
        <StatCard
          title="Ingresos Mes Actual"
          value=""
          icon={<CreditCard className="text-emerald-400 size-5" />}
        >
          {formatMonthlyRevenue(initialSummary.monthlyRevenue)}
        </StatCard>
      </div>

      <div className="h-px w-full bg-border/50 my-2" />

      {initialPlans.length === 0 ? (
        <NoData
          icon={LayoutTemplate}
          message="No hay planes registrados. Crea uno nuevo para empezar a ofrecer membresías."
          className="bg-surface/50 border-dashed"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {initialPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              activeMembersCount={plan.activeMembersCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
