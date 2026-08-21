"use client";

import { Zap } from "lucide-react";
import { Badge } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { AiUsage } from "@/lib/features/quota";
import { formatQuotaLabel, isQuotaExhausted } from "@/lib/features/quota";

interface AiQuotaBannerProps {
  readonly usage: AiUsage | null | undefined;
}

export function AiQuotaBanner({ usage }: AiQuotaBannerProps) {
  if (!usage) return null;

  const dailyExhausted = isQuotaExhausted(usage.daily);

  const Cell = ({ label, value }: { label: string; value: { used: number; limit: number } }) => (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</div>
      <div className="text-sm font-bold tracking-tight text-foreground">{formatQuotaLabel(value)}</div>
    </div>
  );

  return (
    <div className={cn("overflow-hidden rounded-xl border", dailyExhausted ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-surface")}>
      <div className="grid grid-cols-3 divide-x divide-border-muted">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <Zap className={`size-3.5 shrink-0 ${dailyExhausted ? "text-amber-600" : "text-primary"}`} />
          <Cell label="Diaria" value={usage.daily} />
        </div>
        <div className="px-3 py-2">
          <Cell label="Semanal" value={usage.weekly} />
        </div>
        <div className="px-3 py-2">
          <Cell label="Mensual" value={usage.monthly} />
        </div>
      </div>
      {dailyExhausted && (
        <div className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <Badge variant="warning" size="sm" className="uppercase tracking-widest text-[10px] shrink-0">
            Diaria agotada
          </Badge>
          <span className="text-xs text-foreground-muted">Se renueva a medianoche UTC.</span>
        </div>
      )}
    </div>
  );
}