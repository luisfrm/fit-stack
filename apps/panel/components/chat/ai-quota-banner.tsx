"use client";

import { Zap } from "lucide-react";
import { Badge } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { AiUsage } from "@/lib/features/quota";
import { formatQuotaLabel, formatRemaining, isQuotaExhausted } from "@/lib/features/quota";

interface AiQuotaBannerProps {
  readonly usage: AiUsage | null | undefined;
}

export function AiQuotaBanner({ usage }: AiQuotaBannerProps) {
  if (!usage) return null;

  const monthly = usage.monthly;
  if (!monthly) return null;
  const exhausted = isQuotaExhausted(monthly);
  const isUnlimited = monthly.limit === 0;

  return (
    <div className={cn("overflow-hidden rounded-xl border", exhausted ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-surface")}>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Zap className={`size-3.5 shrink-0 ${exhausted ? "text-amber-600" : "text-primary"}`} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Créditos del ciclo</div>
            <div className="text-sm font-bold tracking-tight text-foreground">
              {isUnlimited ? "Ilimitado" : `${formatQuotaLabel(monthly)} créditos`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Restantes</div>
          <div className="text-sm font-bold tracking-tight text-foreground">
            {isUnlimited ? "Ilimitado" : formatRemaining(usage.remaining)}
          </div>
        </div>
      </div>
      {exhausted ? (
        <div className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <Badge variant="warning" size="sm" className="uppercase tracking-widest text-[10px] shrink-0">
            Sin créditos
          </Badge>
          <span className="text-xs text-foreground-muted">Se renueva con el ciclo de suscripción (o el día 1 si no hay sub).</span>
        </div>
      ) : (
        <div className="border-t border-border-muted px-3 py-1.5 text-[11px] text-foreground-muted">
          {isUnlimited ? "Plan sin límite de créditos en este ciclo." : "1 crédito = 1K tokens · Recarga disponible cuando se agoten."}
        </div>
      )}
    </div>
  );
}
