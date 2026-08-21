"use client";

import { Gift, Sparkles, Info } from "lucide-react";
import { Badge } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { PlanFeaturesV2 } from "@workspace/shared";
import { FEATURE_CATALOG, formatFeatureLimits } from "@workspace/shared";

interface FreeTierBannerProps {
  readonly features: PlanFeaturesV2;
  readonly isFreeTier: boolean;
  readonly className?: string;
}

/**
 * Banner visible solo cuando la org está en free tier.
 * Lista las features activas + límites de forma legible.
 * Sigue el design system: rounded-xl, bg-white/5, border-white/10, OKLCH.
 */
export function FreeTierBanner({ features, isFreeTier, className }: FreeTierBannerProps) {
  if (!isFreeTier) return null;

  const activeFeatures = (Object.entries(FEATURE_CATALOG) as [keyof PlanFeaturesV2, (typeof FEATURE_CATALOG)[keyof typeof FEATURE_CATALOG]][])
    .filter(([id]) => features[id]?.enabled)
    .map(([id, def]) => {
      const value = features[id];
      const limits = formatFeatureLimits(value);
      return { id, label: def.label, limits, alwaysOn: (def as { alwaysOn?: boolean }).alwaysOn };
    });

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface pl-0 flex flex-col sm:flex-row sm:items-stretch",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
      <div className="flex flex-1 items-start gap-3 px-4 py-3">
        <span className="hidden sm:inline-flex size-7 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0 mt-0.5">
          <Gift className="size-3.5 text-amber-600 dark:text-amber-400" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">Plan gratuito activo</span>
            <Badge variant="warning" size="sm" className="uppercase tracking-widest text-[10px]">
              Free tier
            </Badge>
            <span className="hidden sm:inline text-xs text-foreground-muted">· algunos módulos ocultos</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Estás en el piso de la plataforma. Desbloquea CMS, portal ilimitado o IA con una suscripción.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {activeFeatures.map((f) => (
              <span
                key={String(f.id)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px]"
              >
                {f.alwaysOn ? <Sparkles className="size-3 text-primary" /> : <Info className="size-3 text-foreground-dim" />}
                <span className="font-semibold text-foreground">{f.label}</span>
                {f.limits && <span className="text-foreground-muted">· {f.limits}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
