"use client";

import * as React from "react";
import { Plus, LayoutTemplate, Users, CreditCard, Loader2 } from "lucide-react";
import { Button, toast, Text } from "@workspace/ui/components";
import { type IMembershipPlan, type IMembershipsSummary } from "@/types/dashboard";
import { plansService } from "@/lib/services/plans-service";
import { PlanCard } from "@/components/memberships/plan-card";
import { PlanModal } from "@/components/memberships/plan-modal";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { NoData } from "@/components/dashboard/dashboard-ui";

export default function MembershipsPage() {
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);
  const [summary, setSummary] = React.useState<IMembershipsSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { settings } = useSettings();

  const activeCurrencies: string[] = React.useMemo(() => {
    const active = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!active) return ["USD"];
    try {
      return JSON.parse(active);
    } catch {
      return ["USD"];
    }
  }, [settings]);

  const currencyFormat = settings[SETTINGS_KEYS.CURRENCY_FORMAT] || "latam";

  const loadPlans = async () => {
    try {
      setLoading(true);
      const [plansData, summaryData] = await Promise.all([
        plansService.getAll({ includeStats: true }),
        plansService.getSummary()
      ]);
      setPlans(plansData);
      setSummary(summaryData);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar planes");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPlans();
  }, []);

  const formatMonthlyRevenue = (revenue: Record<string, number>) => {
    // Unión de monedas activas + monedas con ingresos reales
    const revenueKeys = Object.keys(revenue);
    const allDisplayCurrencies = Array.from(new Set([...activeCurrencies, ...revenueKeys]));

    if (allDisplayCurrencies.length === 0) return "$0";

    return (
      <div className="flex flex-col gap-0.5">
        {allDisplayCurrencies.map(cur => {
          const rawAmount = revenue[cur] ?? 0;
          const amount = rawAmount / 100;
          const locale = currencyFormat === "usa" ? "en-US" : "es-ES";

          // Solo mostramos monedas desactivadas si tienen un monto mayor a 0
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-24 text-foreground-muted flex flex-col items-center justify-center gap-4 bg-surface/50 border border-border rounded-2xl border-dashed">
          <Loader2 className="animate-spin text-primary" size={32} />
          <Text size="sm" weight="medium">Cargando planes del gimnasio...</Text>
        </div>
      );
    }

    if (plans.length === 0) {
      return (
        <NoData 
          icon={LayoutTemplate}
          message="No hay planes registrados. Crea uno nuevo para empezar a ofrecer membresías." 
          className="bg-surface/50 border-dashed"
        />
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onUpdate={() => loadPlans()}
            activeMembersCount={plan.activeMembersCount}
          />
        ))}
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
          onSuccess={() => loadPlans()}
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
          value={plans.filter(p => p.isVisibleOnSite).length.toString()}
          icon={<LayoutTemplate className="text-primary size-5" />}
        />
        <StatCard
          title="Suscripciones Totales"
          value={loading ? "..." : (summary?.totalActiveSubscriptions ?? 0).toString()}
          icon={<Users className="text-blue-400 size-5" />}
        />
        <StatCard
          title="Ingresos Mes Actual"
          value={loading ? "..." : ""} // Valor vacío para el header, el formatted va abajo
          icon={<CreditCard className="text-emerald-400 size-5" />}
        >
          {!loading && formatMonthlyRevenue(summary?.monthlyRevenue ?? {})}
        </StatCard>
      </div>

      <div className="h-px w-full bg-border/50 my-2" />

      {renderContent()}
    </div>
  );
}
