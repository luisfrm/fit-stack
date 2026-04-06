"use client";

import * as React from "react";
import { type IPlatformPlan } from "@workspace/shared/types";
import { 
  Button, 
  toast, 
  Text,
  Separator
} from "@workspace/ui/components";
import { 
  Trash2, 
  Users, 
  ShieldCheck, 
  Smartphone, 
  Globe, 
  BookOpen, 
  Clock 
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { PlatformPlanModal } from "./platform-plan-modal";
import { platformPlansService } from "@/lib/services/platform-plans-service";

interface PlatformPlanCardProps {
  readonly plan: IPlatformPlan;
  readonly onUpdate: () => void;
}

interface FeatureItemProps {
  readonly icon: any;
  readonly label: string;
  readonly active?: boolean;
  readonly detail?: string;
}

function FeatureItem({ icon: Icon, label, active = true, detail }: FeatureItemProps) {
  return (
    <div className={cn("flex items-center gap-3 py-1", !active && "opacity-40 grayscale")}>
      <Icon size={16} className={active ? "text-primary" : "text-slate-500"} />
      <div className="flex flex-col">
        <Text size="xs" weight="bold" className={cn("uppercase tracking-widest", active ? "text-white" : "text-slate-500")}>
          {label}
        </Text>
        {detail && <Text size="xs" className="text-slate-500">{detail}</Text>}
      </div>
    </div>
  );
}

export function PlatformPlanCard({ plan, onUpdate }: PlatformPlanCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await platformPlansService.delete(plan.id);
      toast.success("Plan de plataforma desactivado.");
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar");
    } finally {
      setIsDeleting(false);
    }
  };

  const features = plan.features || { 
    limits: { members: 0, coaches: 0 }, 
    access: { pwa: false, blog: false, web_commercial: false } 
  };

  const isActiveVariant = plan.isActive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20";
  const buttonStyle = plan.isActive ? "bg-primary text-black hover:bg-primary/90" : "bg-white/5 text-white hover:bg-white/10";

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 hover:border-primary/20 transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <Text size="lg" weight="bold" className="text-white uppercase tracking-tighter">
            {plan.name}
          </Text>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-primary">
              <Text size="lg" weight="bold">
                ${Number.parseFloat(plan.monthlyPrice.toString()).toLocaleString()}
              </Text>
              <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">/ Mes</Text>
            </div>
            {plan.yearlyPrice && Number.parseFloat(plan.yearlyPrice.toString()) > 0 && (
              <div className="flex items-center gap-1 opacity-70">
                <Text size="xs" weight="bold" className="text-white">
                  ${Number.parseFloat(plan.yearlyPrice.toString()).toLocaleString()}
                </Text>
                <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">/ Año</Text>
              </div>
            )}
          </div>
        </div>
        <div className={cn(
          "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border",
          isActiveVariant
        )}>
          {plan.isActive ? "Activo" : "Inactivo"}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Clock size={14} className="text-slate-500" />
        <Text size="xs" variant="muted">Sugerido: <span className="text-slate-300 font-bold">{plan.suggestedDurationDays} días</span></Text>
      </div>

      <Separator className="bg-white/10 mb-6" />

      <div className="space-y-4 mb-8">
        <div className="space-y-2">
          <FeatureItem 
            icon={Users} 
            label="Miembros" 
            detail={features.limits?.members ? `${features.limits.members} Miembros máx.` : "Ilimitados"} 
          />
          <FeatureItem 
            icon={ShieldCheck} 
            label="Coaches" 
            detail={features.limits?.coaches ? `${features.limits.coaches} Coaches máx.` : "Ilimitados"} 
          />
        </div>

        <Separator className="bg-white/5 h-px mb-4" />

        <div className="space-y-3">
          <FeatureItem 
            icon={Smartphone} 
            label="Aplicación (PWA)" 
            active={features.access?.pwa} 
          />
          <FeatureItem 
            icon={BookOpen} 
            label="Módulo de Blog" 
            active={features.access?.blog} 
          />
          <FeatureItem 
            icon={Globe} 
            label="Web Comercial" 
            active={features.access?.web_commercial} 
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <PlatformPlanModal 
          planData={plan}
          onSuccess={onUpdate}
          trigger={
            <Button className={cn("flex-1 uppercase font-black text-xs tracking-widest h-11 transition-all", buttonStyle)}>
              Editar Plan
            </Button>
          }
        />
        <Button 
          variant="outlined" 
          size="icon" 
          onClick={handleDelete}
          disabled={isDeleting}
          className="h-11 w-11 border-red-500/10 hover:bg-red-500/10 bg-transparent"
        >
          <Trash2 size={18} className="text-red-500/60" />
        </Button>
      </div>
    </div>
  );
}
