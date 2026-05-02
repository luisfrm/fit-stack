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

/* ─────────────────────────────────────────────
   CONSTANTS & HELPERS
   ───────────────────────────────────────────── */

const DURATION_LABELS: Record<string, { singular: string; plural: string; short: string }> = {
  day: { singular: 'Día', plural: 'Días', short: 'día(s)' },
  week: { singular: 'Semana', plural: 'Semanas', short: 'semana(s)' },
  month: { singular: 'Mes', plural: 'Meses', short: 'mes(es)' },
  year: { singular: 'Año', plural: 'Años', short: 'año(s)' },
};

/**
 * Formats duration value and unit into a descriptive string.
 */
const getDurationText = (value: number, unit: string, isShort = false) => {
  const labels = DURATION_LABELS[unit] || { singular: unit, plural: unit, short: unit };
  if (isShort) return labels.short;
  return value === 1 ? labels.singular : `${value} ${labels.plural}`;
};

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
   ───────────────────────────────────────────── */

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

function PlanFeatures({ features }: { readonly features: any }) {
  return (
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
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */

interface PlatformPlanCardProps {
  readonly plan: IPlatformPlan;
  readonly onUpdate: () => void;
}

export function PlatformPlanCard({ plan, onUpdate }: PlatformPlanCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Style Variants
  const styles = React.useMemo(() => ({
    statusWrapper: plan.isActive
      ? "bg-success/10 text-success border-success/20"
      : "bg-destructive/10 text-destructive border-destructive/20",
    editButton: plan.isActive
      ? "bg-primary text-black hover:bg-primary/90"
      : "bg-white/5 text-white hover:bg-white/10",
  }), [plan.isActive]);

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

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 hover:border-primary/20 transition-all group">
      {/* Header & Price */}
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <Text size="lg" weight="bold" className="text-white uppercase tracking-tighter">
            {plan.name}
          </Text>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-primary">
              <Text size="lg" weight="bold">
                ${(Number(plan.price) / 100).toLocaleString()}
              </Text>
              <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">
                / {getDurationText(plan.durationValue, plan.durationUnit)}
              </Text>
            </div>
          </div>
        </div>
        <div className={cn(
          "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border",
          styles.statusWrapper
        )}>
          {plan.isActive ? "Activo" : "Inactivo"}
        </div>
      </div>

      {/* Persistence Label */}
      <div className="flex items-center gap-2 mb-6">
        <Clock size={14} className="text-slate-500" />
        <Text size="xs" variant="muted">Periodicidad: <span className="text-slate-300 font-bold">
          {plan.durationValue} {getDurationText(plan.durationValue, plan.durationUnit, true)}
        </span></Text>
      </div>

      <Separator className="bg-white/10 mb-6" />

      {/* Feature List */}
      <PlanFeatures features={features} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <PlatformPlanModal
          planData={plan}
          onSuccess={onUpdate}
          trigger={
            <Button className={cn("flex-1 uppercase font-black text-xs tracking-widest h-11 transition-all", styles.editButton)}>
              Editar Plan
            </Button>
          }
        />
        <Button
          variant="outlined"
          size="icon"
          onClick={handleDelete}
          disabled={isDeleting}
          className="h-11 w-11 border-destructive/10 hover:bg-destructive/10 bg-transparent"
        >
          <Trash2 size={18} className="text-destructive/60" />
        </Button>
      </div>
    </div>
  );
}
