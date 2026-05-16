"use client";

import * as React from "react";
import { Plus, ShieldCheck, Loader2, Users, CreditCard, TrendingUp } from "lucide-react";
import { Button, toast, Text } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PlatformPlanCard } from "@/components/platform/platform-plan-card";
import { PlatformPlanModal } from "@/components/platform/platform-plan-modal";
import { platformPlansService, type PlatformPlansSummary } from "@/lib/services/platform-plans-service";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";
import { type IPlatformPlan } from "@workspace/shared/types";

export default function PlatformPlansPage() {
  const [plans, setPlans] = React.useState<IPlatformPlan[]>([]);
  const [summary, setSummary] = React.useState<PlatformPlansSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { settings } = usePlatformSettings();

  const activeCurrencies: string[] = React.useMemo(() => {
    const active = settings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!active) return ["USD"];
    try {
      return JSON.parse(active);
    } catch {
      return ["USD"];
    }
  }, [settings]);

  const currencyFormat = settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] || "latam";

  const loadPlans = async () => {
    try {
      setLoading(true);
      const [plansData, summaryData] = await Promise.all([
        platformPlansService.getAllWithStats() as Promise<any[]>,
        platformPlansService.getSummary()
      ]);
      setPlans(plansData);
      setSummary(summaryData);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar planes de plataforma");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPlans();
  }, []);

  const formatMonthlyRevenue = (revenue: Record<string, number>) => {
    const revenueKeys = Object.keys(revenue);
    const allDisplayCurrencies = Array.from(new Set([...activeCurrencies, ...revenueKeys]));

    if (allDisplayCurrencies.length === 0) return null;

    return (
      <div className="flex flex-col gap-0.5">
        {allDisplayCurrencies.map(cur => {
          const rawAmount = revenue[cur] ?? 0;
          const amount = Number(rawAmount) / 100;
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-24 text-foreground-muted flex flex-col items-center justify-center gap-4 bg-surface/50 border border-border rounded-2xl border-dashed">
          <Loader2 className="animate-spin text-primary" size={32} />
          <Text size="sm" weight="medium">Cargando planes de plataforma...</Text>
        </div>
      );
    }

    if (plans.length === 0) {
      return (
        <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10 flex flex-col items-center gap-4">
          <ShieldCheck size={48} className="text-slate-600" />
          <div>
            <Text size="lg" weight="bold" className="text-slate-400">No hay planes de plataforma</Text>
            <Text size="sm" variant="muted">Crea el primer nivel de suscripción para Fit-Stack.</Text>
          </div>
          <PlatformPlanModal
            onSuccess={loadPlans}
            trigger={
              <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
                CREAR PRIMER PLAN
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {plans.map((plan: any) => (
          <PlatformPlanCard
            key={plan.id}
            plan={plan}
            onUpdate={loadPlans}
            organizationCount={plan.organizationCount}
          />
        ))}
      </div>
    );
  };

  const hasTrialPlan = plans.some(p => (Number(p.price) / 100) === 0);
  const trialPlanStatus = hasTrialPlan ? "Habilitado" : "No detectado";

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Planes de Plataforma"
        description="Configuración global de los niveles de servicio y derechos de acceso (Entitlements)."
        iconName="ShieldCheck"
      >
        <PlatformPlanModal
          onSuccess={loadPlans}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO PLAN
            </Button>
          }
        />
      </DashboardHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Niveles"
          value={loading ? "..." : plans.length.toString()}
          icon={<ShieldCheck className="text-primary size-5" />}
        />
        <StatCard
          title="Suscripciones Activas"
          value={loading ? "..." : (summary?.activeSubscriptions ?? 0).toString()}
          icon={<Users className="text-blue-400 size-5" />}
        />
        <StatCard
          title="Ingresos Mensuales"
          value={loading ? "..." : ""}
          icon={<CreditCard className="text-emerald-400 size-5" />}
        >
          {!loading && summary?.monthlyRevenue && formatMonthlyRevenue(summary.monthlyRevenue)}
        </StatCard>
        <StatCard
          title="Esquema Trial"
          value={loading ? "..." : trialPlanStatus}
          icon={<TrendingUp className="text-blue-400 size-5" />}
        />
      </div>

      <div className="h-px w-full bg-border/50 my-2" />

      {renderContent()}
    </div>
  );
}