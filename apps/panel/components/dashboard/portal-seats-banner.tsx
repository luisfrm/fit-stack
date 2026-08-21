import { Users } from "lucide-react";

interface PortalSeatsBannerProps {
  readonly used: number;
  readonly limit: number;
  readonly pending: number;
}

/**
 * Contador de cupos del portal de miembros. Solo se renderiza cuando la
 * feature `members_portal` está activa (ver pages de members/staff).
 */
export function PortalSeatsBanner({ used, limit, pending }: PortalSeatsBannerProps) {
  const unlimited = limit === 0;
  const total = used + pending;
  const pct = unlimited ? 0 : Math.min(1, total / limit);
  const nearLimit = !unlimited && pct >= 0.8;
  const exhausted = !unlimited && total >= limit;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Users className={`size-3.5 ${exhausted ? "text-amber-600" : "text-primary"}`} />
          <span className="font-bold text-foreground">{unlimited ? "∞" : `${used} / ${limit}`}</span>
          <span className="text-foreground-muted">cupos usados</span>
          {pending > 0 && <span className="text-foreground-dim">· {pending} pendiente(s)</span>}
        </span>
        {!unlimited && (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${exhausted ? "text-amber-600 dark:text-amber-400" : nearLimit ? "text-amber-600/80 dark:text-amber-400/80" : "text-foreground-muted"}`}>
            {exhausted ? "Agotados" : nearLimit ? "Cerca del límite" : `${Math.round(pct * 100)}%`}
          </span>
        )}
      </div>
      {!unlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2 border border-border-muted">
          <div
            className={`h-full rounded-full transition-all ${exhausted ? "bg-amber-500" : nearLimit ? "bg-amber-500/80" : "bg-primary"}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-foreground-muted">
        {unlimited ? "Sin límite en este plan." : exhausted ? "No se pueden invitar más miembros hasta liberar cupos." : "Se cuenta usado + pendiente."}
      </p>
    </div>
  );
}