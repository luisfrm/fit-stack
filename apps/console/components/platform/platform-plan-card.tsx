"use client";

import * as React from "react";
import { type IPlatformPlan } from "@workspace/shared/types";
import {
  Button,
  toast,
  Text,
  Separator,
  Badge,
} from "@workspace/ui/components";
import {
  Trash2,
  Clock,
  Building2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { PlatformPlanModal } from "./platform-plan-modal";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import {
  FEATURE_CATALOG,
  formatFeatureLimits,
  resolveFeatures,
  type FeatureCatalog,
  type PlanFeaturesV2,
} from "@workspace/shared";

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
  readonly label: string;
  readonly active?: boolean;
  readonly detail?: string;
}

function FeatureItem({ label, active = true, detail }: FeatureItemProps) {
  return (
    <div className={cn("flex items-center gap-3 py-1", !active && "opacity-40 grayscale")}>
      {active ? (
        <Check size={16} className="text-primary shrink-0" />
      ) : (
        <X size={16} className="text-slate-500 shrink-0" />
      )}
      <div className="flex flex-col">
        <Text size="xs" weight="bold" className={cn("uppercase tracking-widest", active ? "text-white" : "text-slate-500")}>
          {label}
        </Text>
        {detail && <Text size="xs" className="text-slate-500">{detail}</Text>}
      </div>
    </div>
  );
}

function PlanFeatures({ features, catalog }: { readonly features: PlanFeaturesV2; readonly catalog: FeatureCatalog }) {
  const resolved = resolveFeatures(features);

  return (
    <div className="space-y-4 mb-8">
      <div className="space-y-2">
        {Object.entries(catalog).map(([id, def]) => {
          const value = resolved[id as keyof PlanFeaturesV2];
          const enabled = value?.enabled ?? false;
          const limits = formatFeatureLimits(value);
          return (
            <FeatureItem
              key={id}
              label={def.label}
              active={enabled}
              detail={enabled && limits ? limits : undefined}
            />
          );
        })}
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
  readonly organizationCount?: number;
  readonly settings?: Record<string, string>;
  readonly catalog?: FeatureCatalog;
}

export function PlatformPlanCard({ plan, onUpdate, organizationCount, settings, catalog }: PlatformPlanCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const activeCatalog = catalog ?? FEATURE_CATALOG;

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

  const features = resolveFeatures(plan.features as PlanFeaturesV2 | null | undefined);
  const isZeroPrice = Number(plan.price) === 0;

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
        <div className="flex flex-col items-end gap-1.5">
          {isZeroPrice && (
            <Badge variant="info" size="sm" className="uppercase tracking-widest">
              Precio 0 / Trial
            </Badge>
          )}
          <div className={cn(
            "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border",
            styles.statusWrapper
          )}>
            {plan.isActive ? "Activo" : "Inactivo"}
          </div>
        </div>
      </div>

      {/* Persistence Label */}
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-slate-500" />
        <Text size="xs" variant="muted">Periodicidad: <span className="text-slate-300 font-bold">
          {plan.durationValue} {getDurationText(plan.durationValue, plan.durationUnit, true)}
        </span></Text>
        {organizationCount !== undefined && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
            <Building2 size={12} className="text-primary" />
            <Text size="xs" weight="bold" className="text-primary uppercase tracking-widest">
              {organizationCount} org{organizationCount !== 1 ? 's' : ''}
            </Text>
          </div>
        )}
      </div>

      <Separator className="bg-white/10 mb-6" />

      {/* Feature List */}
      <PlanFeatures features={features} catalog={activeCatalog} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <PlatformPlanModal
          planData={plan}
          onSuccess={onUpdate}
          settings={settings}
          catalog={activeCatalog}
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