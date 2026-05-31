"use client";

import * as React from "react";
import { Plus, ShieldCheck, Loader2, Users, CreditCard, TrendingUp } from "lucide-react";
import { Button, toast, Text, SimpleTooltip, TooltipProvider } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { StatCard } from "@workspace/ui/components";
import { PlatformPlanCard } from "@/components/platform/platform-plan-card";
import { PlatformPlanModal } from "@/components/platform/platform-plan-modal";
import { platformPlansService, type PlatformPlansSummary } from "@/lib/services/platform-plans-service";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";
import { useExchangeRates } from "@/lib/hooks/use-exchange-rates";
import { type IPlatformPlan } from "@workspace/shared/types";

export default function PlatformPlansPage() {
  const [plans, setPlans] = React.useState<IPlatformPlan[]>([]);
  const [summary, setSummary] = React.useState<PlatformPlansSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { settings } = usePlatformSettings();

  const primaryCurrency = settings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat = settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] || "latam";

  const { data: rates } = useExchangeRates(primaryCurrency);

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

  const locale = currencyFormat === "usa" ? "en-US" : "es-ES";

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 > 0 ? 2 : 0,
    }).format(amount);
  };

  const computeRevenueBreakdown = (revenue: Record<string, number>) => {
    let totalInPrimary = 0;
    const breakdown: { currency: string; amount: number; converted: number; rate: number }[] = [];

    for (const [cur, rawAmount] of Object.entries(revenue)) {
      const amount = Number(rawAmount) / 100;
      if (amount === 0) continue;

      let rate = 1;
      if (cur !== primaryCurrency && rates) {
        rate = rates[cur] ?? 1;
      }

      const converted = cur === primaryCurrency ? amount : amount * rate;
      totalInPrimary += converted;
      breakdown.push({ currency: cur, amount, converted, rate });
    }

    return { totalInPrimary, breakdown };
  };

  const renderRevenueCard = (revenue: Record<string, number>) => {
    const { totalInPrimary, breakdown } = computeRevenueBreakdown(revenue);
    const hasMultiple = breakdown.length > 1;

    const card = (
      <StatCard
        title="Ingresos Mensuales"
        value={loading ? "..." : formatCurrency(totalInPrimary, primaryCurrency)}
        icon={<CreditCard className="text-emerald-400 size-5" />}
      />
    );

    if (!hasMultiple || loading) return card;

    return (
      <TooltipProvider>
        <SimpleTooltip
          side="bottom"
          delayDuration={200}
          content={
            <div className="flex flex-col gap-1.5 py-1 min-w-[180px]">
              <Text size="xs" weight="bold" className="text-background/80 uppercase tracking-widest">
                Desglose por Moneda
              </Text>
              {breakdown.map(({ currency, amount, converted, rate }) => (
                <div key={currency} className="flex items-center justify-between gap-3">
                  <Text size="xs" className="text-background/70">
                    {formatCurrency(amount, currency)}
                  </Text>
                  {currency !== primaryCurrency && (
                    <Text size="xs" className="text-background/50">
                      ≈ {formatCurrency(converted, primaryCurrency)}
                      <span className="ml-1 opacity-60">({rate.toFixed(2)})</span>
                    </Text>
                  )}
                </div>
              ))}
            </div>
          }
        >
          {card}
        </SimpleTooltip>
      </TooltipProvider>
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
        {summary?.monthlyRevenue ? renderRevenueCard(summary.monthlyRevenue) : (
          <StatCard
            title="Ingresos Mensuales"
            value={loading ? "..." : formatCurrency(0, primaryCurrency)}
            icon={<CreditCard className="text-emerald-400 size-5" />}
          />
        )}
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
