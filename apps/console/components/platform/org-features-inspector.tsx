"use client";

import { Sparkles, Gift } from "lucide-react";
import { Badge } from "@workspace/ui/components";
import {
  FEATURE_CATALOG,
  formatFeatureLimits,
  resolveFeatures,
  type PlanFeaturesV2,
  type FeatureCatalog,
} from "@workspace/shared";

interface OrgFeaturesInspectorProps {
  readonly subscriptionPlanFeatures?: PlanFeaturesV2 | null;
  readonly freeTierFeatures: PlanFeaturesV2;
  readonly catalog?: FeatureCatalog;
  readonly organizationName?: string;
  readonly isFreeTierFallback?: boolean;
}

function FeatureDiffRow({
  label,
  planValue,
  freeValue,
  alwaysOn,
}: {
  label: string;
  planValue?: { enabled: boolean; limits?: Record<string, number> };
  freeValue?: { enabled: boolean; limits?: Record<string, number> };
  alwaysOn?: boolean;
}) {
  const planLimits = formatFeatureLimits(planValue);
  const freeLimits = formatFeatureLimits(freeValue);
  return (
    <div className="grid grid-cols-[1fr_92px_92px] sm:grid-cols-[1fr_120px_120px] gap-2 items-center px-3 sm:px-4 py-2.5 text-xs border-b border-border-muted last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-1.5 rounded-full shrink-0 ${planValue?.enabled ? "bg-primary" : "bg-border"}`} aria-hidden />
        <span className="truncate text-[13px] font-semibold text-foreground">{label}</span>
        {alwaysOn && <span className="hidden sm:inline-flex rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">Always on</span>}
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${planValue?.enabled ? "bg-success/10 border-success/20 text-success" : "bg-surface-2 border-border text-foreground-muted"}`}>
          {planValue?.enabled ? "Sí" : "No"}
        </span>
        {planLimits && <div className="hidden sm:block text-[11px] text-foreground-muted truncate mt-0.5">{planLimits}</div>}
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${freeValue?.enabled ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-surface-2 border-border text-foreground-muted"}`}>
          {freeValue?.enabled ? "Sí" : "No"}
        </span>
        {freeLimits && <div className="hidden sm:block text-[11px] text-foreground-muted truncate mt-0.5">{freeLimits}</div>}
      </div>
    </div>
  );
}

/**
 * Inspector comparativo: features del plan activo vs free tier global.
 * Pensado para console → Organizations → Suscripciones (admin SaaS).
 * Design: rounded-xl cards, border-white/10, bg-white/5.
 */
export function OrgFeaturesInspector({
  subscriptionPlanFeatures,
  freeTierFeatures,
  catalog,
  organizationName,
  isFreeTierFallback,
}: OrgFeaturesInspectorProps) {
  const activeCatalog = catalog ?? FEATURE_CATALOG;
  const resolvedPlan = resolveFeatures(subscriptionPlanFeatures ?? null);
  const resolvedFree = resolveFeatures(freeTierFeatures ?? null);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            <Sparkles className="size-3.5 text-primary" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight">Features efectivas</div>
            <div className="text-[11px] font-medium text-foreground-muted truncate">
              {organizationName ? organizationName : "Comparativa"} · Plan vs Gratis {isFreeTierFallback && "· Free Tier activo"}
            </div>
          </div>
        </div>
        {isFreeTierFallback ? (
          <Badge variant="warning" size="sm" className="uppercase tracking-widest gap-1">
            <Gift className="size-3" /> Free tier
          </Badge>
        ) : (
          <Badge variant="success" size="sm" className="uppercase tracking-widest">
            Plan activo
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_92px_92px] sm:grid-cols-[1fr_120px_120px] gap-2 px-3 sm:px-4 py-2 border-b border-border-muted bg-surface-2/20 text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
        <span>Feature</span>
        <span className="text-right">Plan</span>
        <span className="text-right">Gratis</span>
      </div>

      <div className="divide-y divide-border-muted">
        {(Object.entries(activeCatalog) as [keyof PlanFeaturesV2, typeof activeCatalog[keyof typeof activeCatalog]][]).map(([id, def]) => (
          <FeatureDiffRow
            key={String(id)}
            label={def.label}
            planValue={resolvedPlan[id]}
            freeValue={resolvedFree[id]}
            alwaysOn={(def as { alwaysOn?: boolean }).alwaysOn}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-muted bg-surface-2/20 px-4 py-2.5 text-[11px] text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Plan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" /> Gratis
        </span>
        <span>· 0 = ∞</span>
        <span className="ml-auto hidden sm:inline text-foreground-dim">Downgrade = hide · sin borrar datos</span>
      </div>
    </section>
  );
}
