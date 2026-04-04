"use client";

import * as React from "react";
import { Plus, LayoutTemplate, Loader2 } from "lucide-react";
import { Button, toast, Text } from "@workspace/ui/components";
import { type IMembershipPlan, type IMembershipsSummary } from "@/types/dashboard";
import { plansService } from "@/lib/services/plans-service";
import { PlanCard } from "@/components/memberships/plan-card";
import { PlanModal } from "@/components/memberships/plan-modal";

export default function MembershipsPage() {
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);
  const [summary, setSummary] = React.useState<IMembershipsSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

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
    const keys = Object.keys(revenue);
    if (keys.length === 0) return "$0";

    return (
      <div className="flex flex-col gap-0.5">
        {keys.map(cur => {
          const amount = (revenue[cur] ?? 0) / 100;
          const formatted = new Intl.NumberFormat("es-ES", {
            style: "currency",
            currency: cur,
            minimumFractionDigits: amount % 1 > 0 ? 2 : 0,
          }).format(amount);

          return (
            <Text key={cur} size="lg" weight="bold" className="text-primary truncate">
              {formatted}
            </Text>
          );
        })}
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-20 text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="animate-spin" size={24} />Cargando planes...
        </div>
      );
    }

    if (plans.length === 0) {
      return (
        <div className="text-center py-20 text-slate-500 bg-white/5 rounded-2xl border border-white/5">
          No hay planes registrados. Crea uno nuevo para empezar.
        </div>
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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3 uppercase">
            <LayoutTemplate className="text-primary w-8 h-8" />
            Planes de Membresía
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Administra y configura los niveles de suscripción de tu gimnasio.
          </p>
        </div>

        <PlanModal
          onSuccess={() => loadPlans()}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO PLAN
            </Button>
          }
        />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Planes Activos</Text>
          <Text size="lg" weight="bold" className="text-white">
            {plans.filter(p => p.isVisibleOnSite).length}
          </Text>
        </div>
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Suscripciones Totales</Text>
          <Text size="lg" weight="bold" className="text-white">
            {loading ? "..." : (summary?.totalActiveSubscriptions ?? 0)}
          </Text>
        </div>
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Ingresos Mes Actual</Text>
          <div className="text-primary">
            {loading ? "..." : formatMonthlyRevenue(summary?.monthlyRevenue ?? {})}
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-white/10 my-2" />

      {renderContent()}
    </div>
  );
}
