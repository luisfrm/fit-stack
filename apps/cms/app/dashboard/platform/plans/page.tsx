"use client";

import * as React from "react";
import { Plus, ShieldCheck, Loader2 } from "lucide-react";
import { Button, toast, Text } from "@workspace/ui/components";
import { type IPlatformPlan } from "@workspace/shared/types";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { PlatformPlanCard } from "@/components/platform/platform-plan-card";
import { PlatformPlanModal } from "@/components/platform/platform-plan-modal";

export default function PlatformPlansPage() {
  const [plans, setPlans] = React.useState<IPlatformPlan[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const data = await platformPlansService.getAll();
      setPlans(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar planes de plataforma");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPlans();
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <Text variant="muted" size="sm" weight="bold" className="uppercase tracking-widest">
            Sincronizando Planes Globales...
          </Text>
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
        {plans.map((plan) => (
          <PlatformPlanCard
            key={plan.id}
            plan={plan}
            onUpdate={loadPlans}
          />
        ))}
      </div>
    );
  };

  const activePlansCount = plans.filter(p => p.isActive).length;
  const hasTrialPlan = plans.some(p => (Number(p.price) / 100) === 0);
  const trialPlanStatus = hasTrialPlan ? "Habilitado" : "No detectado";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ShieldCheck className="text-primary w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase font-display italic">
              SaaS <span className="text-primary">Plans</span>
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Configuración global de los niveles de servicio y derechos de acceso (Entitlements).
          </p>
        </div>

        <PlatformPlanModal
          onSuccess={loadPlans}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO PLAN
            </Button>
          }
        />
      </header>

      {/* ── Platform Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Total Niveles</Text>
          <Text size="lg" weight="bold" className="text-white">
            {loading ? "..." : plans.length}
          </Text>
        </div>
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Planes Activos</Text>
          <Text size="lg" weight="bold" className="text-emerald-500">
            {loading ? "..." : activePlansCount}
          </Text>
        </div>
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Esquema Trial</Text>
          <Text size="lg" weight="bold" className="text-blue-400">
            {loading ? "..." : trialPlanStatus}
          </Text>
        </div>
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-2">Área del Panel</Text>
          <Text size="lg" weight="bold" className="text-primary uppercase italic text-xs tracking-tighter">
            ADMINISTRACIÓN GLOBAL
          </Text>
        </div>
      </div>

      <div className="h-px w-full bg-white/10 my-2" />

      {renderContent()}
    </div>
  );
}
