"use client";

import * as React from "react";
import { Gift, Sparkles, Info, X } from "lucide-react";
import { Badge } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { PlanFeaturesV2 } from "@workspace/shared";
import { FEATURE_CATALOG, formatFeatureLimits } from "@workspace/shared";

interface FreeTierBannerProps {
  readonly features: PlanFeaturesV2;
  readonly isFreeTier: boolean;
  readonly className?: string;
  readonly organizationId?: string | null;
}

const STORAGE_KEY_PREFIX = "fit-stack:free-tier-banner:dismissed";

function getStorageKey(organizationId?: string | null): string {
  return organizationId ? `${STORAGE_KEY_PREFIX}:${organizationId}` : STORAGE_KEY_PREFIX;
}

/**
 * Banner visible solo cuando la org está en free tier.
 * Lista las features activas + límites de forma legible.
 * Sigue el design system: rounded-xl, bg-white/5, border-white/10, OKLCH.
 */
export function FreeTierBanner({ features, isFreeTier, className, organizationId }: FreeTierBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const key = getStorageKey(organizationId);
      if (localStorage.getItem(key) === "1") {
        setDismissed(true);
      }
    } catch {
      // ignore storage errors (private mode)
    }
  }, [organizationId]);

  const handleClose = React.useCallback(() => {
    try {
      const key = getStorageKey(organizationId);
      localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }, [organizationId]);

  if (!isFreeTier || dismissed) return null;

  // Evita flash de banner descartado durante hidratación: hasta montar, renderiza oculto pero sin shift brusco
  if (!mounted) {
    return <div className={cn("h-0 overflow-hidden", className)} aria-hidden />;
  }

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
        // Fixed debajo del top nav: ocupa todo el ancho del main, se mantiene visible al hacer scroll
        "sticky top-0 z-40 -mx-4 lg:-mx-8 border-b border-amber-500/20 bg-amber-500/10 backdrop-blur supports-[backdrop-filter]:bg-amber-500/10",
        // Compensa el padding del main para que quede edge-to-edge arriba
        "-mt-4 lg:-mt-8 mb-4",
        className,
      )}
      role="region"
      aria-label="Plan gratuito activo"
    >
      <div className="relative flex items-start gap-3 px-4 lg:px-8 py-3">
        <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 hidden lg:block" aria-hidden />
        <span className="hidden sm:inline-flex size-7 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/20 shrink-0 mt-0.5">
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
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar aviso de plan gratuito"
          className="ml-2 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-foreground-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
